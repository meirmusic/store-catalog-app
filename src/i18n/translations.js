// UI-chrome string table only. Per SPEC.md section 8: item content and
// Config-driven list values (location/type/physical_status) are NEVER
// translated here - they stay exactly as the team entered them. Only
// fixed UI text (labels, buttons, messages) and the fixed
// availability_status values ("available"/"sold") live in this table.
//
// Dutch entries are a first pass (not reviewed by a native speaker) -
// fine for Stage 1 scaffolding, but should get a native-speaker pass
// before this matters to a real Dutch-speaking staff member.

export const translations = {
  he: {
    'app.title': 'קטלוג הגלריה',
    'app.subtitle': 'ניהול מלאי יצירות',

    'identity.title': 'מי אתה?',
    'identity.subtitle': 'בחר/י שם כדי שנדע למי לשייך שינויים',

    'search.placeholder': 'חיפוש לפי שם, מק"ט או מספר סידורי…',

    'filters.location': 'מיקום',
    'filters.type': 'סוג',
    'filters.status': 'סטטוס',
    'filters.availability': 'זמינות',
    'filters.all': 'הכל',
    'filters.available': 'זמין',
    'filters.sold': 'נמכר',
    'filters.missingSerial': "חסר מס' סידורי",
    'filters.missingSku': 'חסר מק"ט',
    'filters.missingPrice': 'חסר מחיר',

    'actions.newItem': '+ פריט חדש',
    'actions.save': 'שמירה',
    'actions.cancel': 'ביטול',
    'actions.deleteItem': 'מחיקת פריט…',
    'actions.addValue': 'הוסף',
    'actions.removeImage': 'הסר תמונה',
    'actions.generateSerial': 'צור קוד',
    'actions.refresh': 'רענון ידני',

    'fields.name': 'שם היצירה',
    'fields.size': 'גודל',
    'fields.sku': 'מק"ט',
    'fields.status': 'סטטוס (מצב פיזי)',
    'fields.price': 'מחיר (₪)',
    'fields.serialNumber': 'מספר סידורי (תג פיזי)',
    'fields.notes': 'הערות',
    'fields.image': 'תמונה',

    'errors.nameRequired': 'יש להזין שם ליצירה',

    'delete.title': 'האם אתה בטוח?',
    'delete.confirm': 'מחיקה',

    'sync.online': 'מחובר',
    'sync.offline': 'מנותק',
    'sync.pending': 'ממתינים לסנכרון',
    'sync.savedLocal': 'נשמר מקומית - ימתין לסנכרון',
    'sync.savedSynced': 'נשמר וסונכרן',
    'sync.refreshed': 'עודכן',
    'sync.offlineToast': 'אין חיבור - מוצגים הנתונים המקומיים',

    'stats.total': 'סה"כ פריטים',

    'toast.itemDeleted': 'הפריט נמחק',
    'toast.valueAdded': 'נוסף לרשימה',
    'list.empty': 'לא נמצאו פריטים - נסה לשנות את החיפוש או הסינון, או להוסיף פריט חדש',
  },

  en: {
    'app.title': 'Gallery Catalog',
    'app.subtitle': 'Artwork inventory management',

    'identity.title': 'Who are you?',
    'identity.subtitle': 'Choose a name so we know who to attribute changes to',

    'search.placeholder': 'Search by name, SKU, or serial number…',

    'filters.location': 'Location',
    'filters.type': 'Type',
    'filters.status': 'Status',
    'filters.availability': 'Availability',
    'filters.all': 'All',
    'filters.available': 'Available',
    'filters.sold': 'Sold',
    'filters.missingSerial': 'Missing serial number',
    'filters.missingSku': 'Missing SKU',
    'filters.missingPrice': 'Missing price',

    'actions.newItem': '+ New item',
    'actions.save': 'Save',
    'actions.cancel': 'Cancel',
    'actions.deleteItem': 'Delete item…',
    'actions.addValue': 'Add',
    'actions.removeImage': 'Remove image',
    'actions.generateSerial': 'Generate code',
    'actions.refresh': 'Refresh',

    'fields.name': 'Artwork name',
    'fields.size': 'Size',
    'fields.sku': 'SKU',
    'fields.status': 'Status (physical condition)',
    'fields.price': 'Price (₪)',
    'fields.serialNumber': 'Serial number (physical tag)',
    'fields.notes': 'Notes',
    'fields.image': 'Image',

    'errors.nameRequired': 'Please enter a name for the artwork',

    'delete.title': 'Are you sure?',
    'delete.confirm': 'Delete',

    'sync.online': 'Online',
    'sync.offline': 'Offline',
    'sync.pending': 'pending sync',
    'sync.savedLocal': 'Saved locally - will sync later',
    'sync.savedSynced': 'Saved and synced',
    'sync.refreshed': 'Updated',
    'sync.offlineToast': 'No connection - showing local data',

    'stats.total': 'Total items',

    'toast.itemDeleted': 'Item deleted',
    'toast.valueAdded': 'Added to the list',
    'list.empty': 'No items found - try changing the search or filters, or add a new item',
  },

  nl: {
    'app.title': 'Galerijcatalogus',
    'app.subtitle': 'Voorraadbeheer kunstwerken',

    'identity.title': 'Wie ben je?',
    'identity.subtitle': 'Kies een naam zodat we weten wie de wijziging heeft gemaakt',

    'search.placeholder': 'Zoek op naam, SKU of serienummer…',

    'filters.location': 'Locatie',
    'filters.type': 'Type',
    'filters.status': 'Status',
    'filters.availability': 'Beschikbaarheid',
    'filters.all': 'Alle',
    'filters.available': 'Beschikbaar',
    'filters.sold': 'Verkocht',
    'filters.missingSerial': 'Serienummer ontbreekt',
    'filters.missingSku': 'SKU ontbreekt',
    'filters.missingPrice': 'Prijs ontbreekt',

    'actions.newItem': '+ Nieuw item',
    'actions.save': 'Opslaan',
    'actions.cancel': 'Annuleren',
    'actions.deleteItem': 'Item verwijderen…',
    'actions.addValue': 'Toevoegen',
    'actions.removeImage': 'Afbeelding verwijderen',
    'actions.generateSerial': 'Genereer code',
    'actions.refresh': 'Vernieuwen',

    'fields.name': 'Naam van het kunstwerk',
    'fields.size': 'Afmeting',
    'fields.sku': 'SKU',
    'fields.status': 'Status (fysieke staat)',
    'fields.price': 'Prijs (₪)',
    'fields.serialNumber': 'Serienummer (fysiek label)',
    'fields.notes': 'Notities',
    'fields.image': 'Afbeelding',

    'errors.nameRequired': 'Voer een naam in voor het kunstwerk',

    'delete.title': 'Weet je het zeker?',
    'delete.confirm': 'Verwijderen',

    'sync.online': 'Online',
    'sync.offline': 'Offline',
    'sync.pending': 'wachten op synchronisatie',
    'sync.savedLocal': 'Lokaal opgeslagen - wordt later gesynchroniseerd',
    'sync.savedSynced': 'Opgeslagen en gesynchroniseerd',
    'sync.refreshed': 'Bijgewerkt',
    'sync.offlineToast': 'Geen verbinding - lokale gegevens worden getoond',

    'stats.total': 'Totaal aantal items',

    'toast.itemDeleted': 'Item verwijderd',
    'toast.valueAdded': 'Toegevoegd aan de lijst',
    'list.empty': 'Geen items gevonden - probeer de zoekopdracht of filters te wijzigen, of voeg een nieuw item toe',
  },
};

export const LANGUAGES = [
  { code: 'he', label: 'עברית', flag: '🇮🇱' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
];

export const DEFAULT_LANGUAGE = 'he';
