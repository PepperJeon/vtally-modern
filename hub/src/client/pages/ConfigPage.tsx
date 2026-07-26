import React from 'react'
import Layout from '../components/layout/Layout'
import MixerSelection from '../components/config/MixerSelection'
import TallySettings from '../components/config/TallySettings'

// Side by side above 1024px (design-screens.md §2.1): the tally defaults are
// what you check *after* choosing a mixer, and stacking them means scrolling
// past a long form to reach them. Fixed measures, not fractions — a form field
// should be ~480px wide regardless of monitor.
const ConfigPage = () => {
  return (
    <Layout testId="config">
      <div className="grid justify-start gap-8 lg:grid-cols-[minmax(0,560px)_minmax(0,480px)]">
        <MixerSelection />
        <TallySettings />
      </div>
    </Layout>
  )
}
export default ConfigPage;
