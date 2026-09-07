// Seed values for the extensible Config lists (see SPEC.md "טאב Config").
// These are a starting point only - staff can add more from within the app.
export const CONFIG_SEED = {
  location: ['אביגדור', 'גלריה', 'חיים'],
  type: ['מקורי', 'מיקס מדיה'],
  physical_status: ['מגולגל', 'מתוח', 'ממוסגר'],
};

// Working assumption for the team roster (see SPEC.md "זהות משתמש") -
// no login, a closed list picked once per device. Update this list if the
// real staff names differ.
export const TEAM_NAMES = ['שרה', 'תמר', 'שפרה', 'פגי', 'דב', 'עמיתי'];
