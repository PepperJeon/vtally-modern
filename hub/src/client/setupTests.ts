// jest-dom adds custom matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

import { setLanguage } from './i18n';

// The app's default language is Korean; the unit suites assert on English copy
// (ChannelSelector.spec.tsx reads "(unpatched)" and "Channel 3"). Pinning here
// rather than editing seven assertions — docs/design/i18n-plan.md §1.2/§1.3,
// authorised in spec-changes.md §3.2.
//
// Safe in the `node` environment too: setLanguage() guards its window access,
// so the suites that never touch a DOM are unaffected.
setLanguage('en');
