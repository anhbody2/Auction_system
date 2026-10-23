import { createAction } from '@reduxjs/toolkit';

/** sec-005: the session ended for inactivity (this tab or another one); every slice drops the user's data. */
export const sessionEnded = createAction('session/ended');
