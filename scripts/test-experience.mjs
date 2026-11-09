// Compatibility entry for callers of the original four-chapter experience QA.
// The shared production page now uses seven chapters and the full-stage suite.
const legacyURL=process.env.EXPERIENCE_TEST_URL??process.env.PROTOTYPE_TEST_URL;
if(legacyURL&&!process.env.DENTAL_STORY_TEST_URL)process.env.DENTAL_STORY_TEST_URL=legacyURL;
if (process.env.EXPERIENCE_REVIEW_DIR && !process.env.DENTAL_STORY_REVIEW_DIR) {
  process.env.DENTAL_STORY_REVIEW_DIR = process.env.EXPERIENCE_REVIEW_DIR;
}
await import('./test-dental-story-browser.mjs');
