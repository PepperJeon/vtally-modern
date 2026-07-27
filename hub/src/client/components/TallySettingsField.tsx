import React from 'react'
import ChipLikeButton from './ChipLikeButton'
import { useT } from '../i18n'

type TallySettingsFieldProps = {
  label: string
  testId: string
  isDefault: boolean
  children?: React.ReactNode
  className?: string
  onChange: (isDefault: boolean) => void
}

function TallySettingsField({label, testId, isDefault, children, className, onChange}:TallySettingsFieldProps) {
  const t = useT()
  return <div className={className}>
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="mb-2 text-lg font-semibold text-white">{label}</h2>
      {/* `size="small"` dropped with MUI's Button — ChipLikeButton is now a native
        * <button>, where `size` is a numeric attribute and means nothing here. */}
      <ChipLikeButton data-testid={`${testId}-toggle`} selected={isDefault} onClick={() => onChange(!isDefault)}>{isDefault ? t.common.default : t.common.custom}</ChipLikeButton>
    </div>
    {children}
  </div>
}

export default TallySettingsField