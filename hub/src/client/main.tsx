import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// No <React.StrictMode>. It is incompatible with react-router v5 from React 18
// onwards, and React 19 is where that stopped being theoretical:
//
// StrictMode remounts every component once on mount (mount -> unmount -> mount)
// reusing the SAME instance. react-router v5's <Router> subscribes to history in
// its *constructor* and unsubscribes in componentWillUnmount — so the simulated
// unmount tears the subscription down and the second mount, which does not run a
// constructor, never gets it back. The result is a router that renders the
// initial URL correctly and then ignores every history.push: deep links work,
// every in-app <Link> click silently does nothing.
//
// That is exactly what it did — smoke.spec.ts 'Navigation is working',
// tally-logs 'should be linked from the tally list' and webtally 'Web Tallies
// are linked' all went red on the React 19 upgrade while the deep-link tests
// beside them stayed green.
//
// Only the dev server was affected (StrictMode's double-invoke is dev-only), but
// the dev server is what everyone develops and runs Cypress against, so a
// dev-only breakage of all navigation is not a survivable trade. The two real
// fixes are "drop StrictMode" and "migrate to react-router v6+"; the router
// migration is deliberately not part of this commit, so it is this one.
createRoot(document.getElementById('root')!).render(<App />);
