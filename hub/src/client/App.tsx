import React from 'react'
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom'
import IndexPage from './pages/IndexPage'
import ConfigPage from './pages/ConfigPage'
import TallyLogPage from './pages/TallyLogPage'
import WebTallyPage from './pages/WebTallyPage'
import FlasherPage from './pages/FlasherPage'

function App() {
  return (
    <Router>
      <Switch>
        <Route exact path="/tally/:tallyId">
          <WebTallyPage />
        </Route>
        <Route exact path="/tally/:tallyId/log">
          <TallyLogPage />
        </Route>
        <Route exact path="/config">
          <ConfigPage />
        </Route>
        <Route exact path="/flasher">
          <FlasherPage />
        </Route>
        <Route path="/">
          <IndexPage />
        </Route>
      </Switch>
    </Router>
  )
}

export default App;
