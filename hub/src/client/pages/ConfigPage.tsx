import React from 'react'
import Layout from '../components/layout/Layout'
import MixerSelection from '../components/config/MixerSelection'
import TallySettings from '../components/config/TallySettings'

const ConfigPage = () => {
  return (
    <Layout testId="config">
      <MixerSelection />
      <TallySettings />
    </Layout>
  )
}
export default ConfigPage;