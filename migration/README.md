# מיגרציה מהאקסל הקיים

ראו `SPEC.md` (סעיף "תוכנית מיגרציה") לפרטים המלאים. סיכום מהיר:

```bash
pip install openpyxl pillow pymupdf
python migration/migrate.py --excel /path/to/store_excel.xlsx
```

הסקריפט **לא** נוגע ב-Google Sheets/Drive בפועל (עוד אין Apps Script פרוס
לדבר איתו) - הוא רק מכין את הנתונים:

- `migration/output/final_items.json` - כל השורות, עם `row_id` ייחודי,
  מספר סידורי שהושלם אוטומטית איפה שחסר, וזיהוי "נמכר" לפי שדה המיקום
- `migration/output/images/` - תמונה לכל שורה שיש לה אחת: התמונה האמיתית
  מהאקסל אם קיימת, אחרת תמונת המוצר הנקייה מקטלוג השיווק (`assets/catalog/`)
  אם המק"ט תואם

**חשוב**: `migration/output/` לא נשמר ב-git (ר' `.gitignore`) - הוא מכיל
נתונים עסקיים אמיתיים מהקובץ המקורי (כולל הערות כמו "נמכר ל-X").

כשה-Apps Script (משימות #1-#3) יהיה פרוס, יתווסף סקריפט המשך קצר שקורא
את `final_items.json` ואת `images/` וקורא בפועל ל-`upsert`/`uploadImage`
עבור כל שורה.
