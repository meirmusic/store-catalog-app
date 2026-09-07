#!/usr/bin/env python3
"""
One-off migration prep: turns the real store Excel into the JSON payload
the real app expects (see SPEC.md "תוכנית מיגרציה" and מבנה הנתונים),
and matches items to product photos from the gallery's own marketing
catalog PDF (assets/catalog/yossi-bitton-catalog-2025.pdf) wherever the
Excel itself has no embedded photo for that row.

This script only PREPARES the data - it does not talk to Google Sheets
or Drive (task #1/#2/#3 aren't live yet). Once the Apps Script backend
exists, a short follow-up script reads migration/output/final_items.json
and migration/output/images/ and calls upsert/uploadImage for each row.

Usage:
    python migration/migrate.py --excel /path/to/store_excel.xlsx

Requires: openpyxl, pillow, pymupdf (pip install openpyxl pillow pymupdf)
"""

import argparse
import hashlib
import io
import json
import os
import random
import re
import string
import sys
import zipfile

import openpyxl
from PIL import Image

try:
    import fitz  # pymupdf
except ImportError:
    fitz = None

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG_PDF = os.path.join(REPO_ROOT, 'assets', 'catalog', 'yossi-bitton-catalog-2025.pdf')
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')

CHARS = string.ascii_uppercase.replace('O', '').replace('I', '') + '23456789'


def gen_code(existing, length=6):
    while True:
        code = ''.join(random.choices(CHARS, k=length))
        if code not in existing:
            existing.add(code)
            return code


# ---------- Excel parsing ----------

def parse_excel_rows(path):
    """Returns a list of raw row dicts in the sheet's column order, plus
    a dict mapping data-row-index (0-based, aligned to this list) -> the
    embedded image bytes for rows that have a real photo in the workbook.
    """
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    cols = ['name', 'size', 'type', 'location', 'sku', 'status', 'notes',
            'image1', 'image2', 'image_access_req', 'serial_number']
    rows = []
    for r in range(2, ws.max_row + 1):
        vals = [ws.cell(row=r, column=c).value for c in range(1, 12)]
        if all(v is None for v in vals):
            continue
        rows.append(dict(zip(cols, vals)))

    # Embedded images: map spreadsheet row (1-indexed) -> raw bytes, via
    # the drawing anchors, same approach used during the demo build.
    anchor_to_bytes = {}
    with zipfile.ZipFile(path) as z:
        drawing_names = [n for n in z.namelist() if re.match(r'xl/drawings/drawing\d+\.xml$', n)]
        for dname in drawing_names:
            xml = z.read(dname).decode('utf-8')
            rels_name = dname.replace('drawings/', 'drawings/_rels/') + '.rels'
            rels = {}
            if rels_name in z.namelist():
                rels_xml = z.read(rels_name).decode('utf-8')
                for rid, target in re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels_xml):
                    rels[rid] = target
            for anchor in re.findall(r'<xdr:oneCellAnchor>.*?</xdr:oneCellAnchor>', xml, re.S):
                row_m = re.search(r'<xdr:row>(\d+)</xdr:row>', anchor)
                rid_m = re.search(r'r:embed="(rId\d+)"', anchor)
                if not row_m or not rid_m or rid_m.group(1) not in rels:
                    continue
                sheet_row = int(row_m.group(1)) + 1  # 0-indexed -> 1-indexed
                target = rels[rid_m.group(1)]
                media_path = 'xl/' + target.replace('../', '')
                anchor_to_bytes[sheet_row] = z.read(media_path)

    data_row_to_bytes = {}
    for sheet_row, img_bytes in anchor_to_bytes.items():
        idx = sheet_row - 2  # data rows start at sheet row 2 -> index 0
        if 0 <= idx < len(rows):
            data_row_to_bytes[idx] = img_bytes

    return rows, data_row_to_bytes


def resize_jpeg(raw_bytes, max_width=900, quality=80, rotate=0):
    im = Image.open(io.BytesIO(raw_bytes)).convert('RGB')
    if rotate:
        im = im.rotate(rotate, expand=True)
    w, h = im.size
    if w > max_width:
        h = round(h * max_width / w)
        w = max_width
        im = im.resize((w, h))
    buf = io.BytesIO()
    im.save(buf, format='JPEG', quality=quality, optimize=True)
    return buf.getvalue()


# ---------- Catalog PDF cross-reference ----------

def extract_catalog_images_by_sku():
    """Returns {sku_str: jpeg_bytes} for every HT-XXXX code found in the
    catalog PDF, picking the clean product photo (not the room/lifestyle
    shot) per page. See migration/README.md for how this heuristic works."""
    if fitz is None:
        print('pymupdf not installed - skipping catalog PDF cross-reference '
              '(pip install pymupdf to enable it)', file=sys.stderr)
        return {}
    if not os.path.exists(CATALOG_PDF):
        print(f'Catalog PDF not found at {CATALOG_PDF} - skipping cross-reference', file=sys.stderr)
        return {}

    doc = fitz.open(CATALOG_PDF)

    hash_count = {}
    for page in doc:
        for img in page.get_images(full=True):
            base = doc.extract_image(img[0])
            h = hashlib.md5(base['image']).hexdigest()
            hash_count[h] = hash_count.get(h, 0) + 1
    repeated = {h for h, c in hash_count.items() if c > 3}  # page-decoration assets

    result = {}
    for page in doc:
        text = page.get_text()
        m = re.search(r'HT\s*-\s*(\d{3,5})', text)
        if not m:
            continue
        code = m.group(1)
        candidates = []
        seen_hashes = set()
        for img in page.get_images(full=True):
            base = doc.extract_image(img[0])
            h = hashlib.md5(base['image']).hexdigest()
            if h in repeated or h in seen_hashes:
                continue
            seen_hashes.add(h)
            candidates.append((base['width'] * base['height'], base['image']))
        candidates.sort(key=lambda c: -c[0])
        if len(candidates) < 2:
            continue
        # Largest candidate is the lifestyle/room photo; the next one down
        # is the clean product shot (verified by hand across the range).
        result[code] = resize_jpeg(candidates[1][1])
    return result


# ---------- Main migration ----------

SOLD_NOTE_ROWS_KEPT_AVAILABLE = True  # see SPEC.md: the 7 "לא זמין בקטלוג" rows
# stay available - "not in the public catalog" isn't the same as sold, and the
# gallery owner confirmed this reading. Only a literal "נמכר" in the location
# field (the 4 clear cases) is treated as sold.


def migrate(excel_path):
    rows, embedded_images = parse_excel_rows(excel_path)
    catalog_images = extract_catalog_images_by_sku()

    os.makedirs(os.path.join(OUTPUT_DIR, 'images'), exist_ok=True)
    existing_ids = set()
    out_items = []
    stats = {'total': 0, 'sold_detected': 0, 'image_from_excel': 0,
              'image_from_catalog': 0, 'no_image': 0, 'serial_generated': 0}

    for i, row in enumerate(rows):
        stats['total'] += 1
        row_id = gen_code(existing_ids)

        location = row.get('location')
        availability = 'available'
        if location and 'נמכר' in str(location):
            availability = 'sold'
            location = None
            stats['sold_detected'] += 1

        sku = row.get('sku')
        sku = str(int(sku)) if isinstance(sku, float) else (str(sku) if sku else None)

        serial = row.get('serial_number')
        if isinstance(serial, float):
            serial = str(int(serial))
        elif serial is not None:
            serial = str(serial)
        if not serial:
            serial = gen_code(existing_ids, length=8)
            stats['serial_generated'] += 1

        image_rel_path = None
        if i in embedded_images:
            # Real photo of this exact physical piece - highest priority.
            # rotate=-90 matches the fixed orientation found during the demo build.
            jpeg = resize_jpeg(embedded_images[i], rotate=-90)
            image_rel_path = f'images/{row_id}.jpg'
            with open(os.path.join(OUTPUT_DIR, image_rel_path), 'wb') as f:
                f.write(jpeg)
            stats['image_from_excel'] += 1
        elif sku and sku in catalog_images:
            image_rel_path = f'images/{row_id}.jpg'
            with open(os.path.join(OUTPUT_DIR, image_rel_path), 'wb') as f:
                f.write(catalog_images[sku])
            stats['image_from_catalog'] += 1
        else:
            stats['no_image'] += 1

        out_items.append({
            'row_id': row_id,
            'serial_number': serial,
            'sku': sku,
            'name': row.get('name') or 'יצירה ללא שם',
            'size': row.get('size'),
            'type': row.get('type'),
            'location': location,
            'physical_status': row.get('status'),
            'availability_status': availability,
            'price': None,
            'notes': row.get('notes'),
            'image_local_path': image_rel_path,  # filled in as image_url after upload
            'is_deleted': False,
            'last_modified_by': None,
            'last_modified_at': None,
        })

    with open(os.path.join(OUTPUT_DIR, 'final_items.json'), 'w', encoding='utf-8') as f:
        json.dump(out_items, f, ensure_ascii=False, indent=1)

    print(json.dumps(stats, ensure_ascii=False, indent=1))
    print(f'\nWrote {len(out_items)} rows to migration/output/final_items.json')
    print('Images saved under migration/output/images/')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--excel', required=True, help='Path to the source store Excel file')
    args = parser.parse_args()
    migrate(args.excel)
