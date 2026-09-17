// Seed values for the extensible Config lists (see SPEC.md "טאב Config").
// These are a starting point only - staff can add more from within the app.
export const CONFIG_SEED = {
  location: ['אביגדור', 'גלריה', 'חיים'],
  type: ['מקורי', 'מיקס מדיה'],
  physical_status: ['מגולגל', 'מתוח', 'ממוסגר'],
};

// Team roster for the "who are you" picker (task #28 v2): shown once the
// shared office Google account is signed in, purely to attribute changes
// to a real staff member (last_modified_by) - it carries no access-control
// weight itself. Update this list if the real staff names differ.
export const TEAM_NAMES = ['שרה', 'תמר', 'שפרה', 'פגי', 'דב', 'עמיתי'];
