import React from 'react'

import type { Translations } from './en'

/**
 * `: Translations` is the entire missing-key strategy. A key that exists in
 * en.tsx and not here fails `tsc`, so there is no runtime fallback to design
 * and no chance of an operator being shown a raw key
 * (docs/design/i18n-plan.md §2.2).
 *
 * Voice and shared nouns come from the product's own Korean, already shipped on
 * the marketing site: `_tally-recovery/tallylite-web/src/i18n/ko.ts` —
 * 탈리 / 믹서 / 허브 / 채널 / 웹 탈리 / 설정 / 연결됨, and `ON AIR` left in
 * Latin. That file is marketing vocabulary and has no term for the hub's
 * operational states, so these are coined here, once:
 *
 *   unpatched    → 미할당      (no channel assigned)
 *   missing      → 응답 없음    (registered, but has stopped reporting)
 *   disconnected → 연결 끊김
 *   preview      → 프리뷰
 *   idle         → 대기
 *   patch        → 채널 할당
 *
 * Do not re-coin these per component.
 */
export const ko: Translations = {
  meta: {
    title: 'vTally 허브',
    noscript: '이 앱을 사용하려면 JavaScript를 활성화해야 합니다.',
  },

  nav: {
    logoAlt: 'vTally',
    tallies: '탈리',
    configuration: '설정',
    flash: '플래시',
    language: '언어',
    languageName: '한국어',
  },

  common: {
    save: '저장',
    cancel: '취소',
    close: '닫기',
    create: '생성',
    loading: '불러오는 중',
    tryAgain: '다시 시도',
    reload: '새로고침',
    closeDialog: '대화상자 닫기',
    default: '기본값',
    custom: '직접 설정',
    off: '꺼짐',
    formHasErrors: '입력값에 오류가 있습니다',
    invalid: '올바르지 않은 값입니다',
  },

  index: {
    hubDisconnectedTitle: '허브 연결 끊김',
    hubDisconnectedBody: '아래 정보는 최신 상태가 아닐 수 있습니다.',
    hubDisconnectedHint: '자동으로 다시 연결하고 있습니다. 페이지를 새로고침해도 됩니다.',
    showDisconnected: '연결 끊긴 탈리 표시',
    showUnpatched: '미할당 탈리 표시',
    hub: '허브',
    mixer: '믹서',
    tallies: '탈리',
    hubTitle: (connected: boolean) => `허브 ${connected ? '연결됨' : '연결 끊김'}`,
    mixerTitle: (connected: boolean) => `비디오 믹서 ${connected ? '연결됨' : '연결 끊김'}`,
    talliesTitle: (n: number | null) => `연결된 탈리 ${n}대`,
    hiddenByFilters: (n: number) => `필터로 숨겨진 탈리 ${n}대`,
    showAll: '모두 표시',
    onAir: 'ON AIR',
    noTallies: '아직 탈리가 없습니다. 허브에 연결되면 여기에 표시됩니다.',
    allHidden: (n: number) => `탈리 ${n}대가 모두 필터로 숨겨져 있습니다.`,
  },

  tally: {
    state: {
      // Broadcast jargon Korean crews use as-is — the marketing site keeps it
      // in Latin too. Translating it would be less legible, not more.
      program: 'ON AIR',
      preview: '프리뷰',
      idle: '대기',
      unpatched: '미할당',
    },
    health: {
      connected: '연결됨',
      missing: '응답 없음',
      disconnected: '연결 끊김',
    },
    cardLabel: (name: string, state: string, health: string) => `${name}, ${state}, ${health}`,
  },

  channel: {
    unpatched: '(미할당)',
    numbered: (id: string) => `채널 ${id}`,
  },

  tallyMenu: {
    menu: (name: string) => `${name} 메뉴`,
    connect: '연결',
    settings: '설정',
    logs: '로그',
    highlight: '하이라이트',
    remove: '삭제',
    notConnected: '탈리가 연결되어 있지 않습니다',
    cannotRemoveConnected: '연결된 탈리는 삭제할 수 없습니다',
  },

  tallyCreate: {
    createWebTally: '웹 탈리 만들기',
    hardwareWarning:
      'ESP8266 기반 하드웨어 탈리는 자동으로 등록되므로 이 양식으로 만들지 마세요.',
    description: '브라우저에서 바로 볼 수 있는 웹 탈리입니다.',
    name: '이름',
    errorEmpty: '이름을 입력하세요',
    errorTooLong: (max: number) => `이름은 ${max}자를 넘을 수 없습니다`,
    errorExists: (name: string) => `'${name}' 이름의 탈리가 이미 있습니다`,
  },

  tallySettings: {
    title: (name: string) => `${name} 설정`,
    operatorBrightness: '오퍼레이터 라이트 밝기',
    operatorColors: '오퍼레이터 라이트 색상',
    operatorDisplay: '오퍼레이터 표시',
    stageBrightness: '스테이지 라이트 밝기',
    stageColors: '스테이지 라이트 색상',
    stageDisplay: '스테이지 표시',
    showsIdleState: '대기 상태 표시',
    showsPreviewState: '프리뷰 상태 표시',
    operatorCannotBeOff: '오퍼레이터 라이트는 끌 수 없습니다.',
  },

  tallyDefaults: {
    title: '탈리 기본값',
    operatorLight: '오퍼레이터 라이트',
    stageLight: '스테이지 라이트',
    brightness: '밝기',
    colours: '색상',
    showsIdle: '대기 상태 표시',
    showsPreview: '프리뷰 상태 표시',
  },

  colorScheme: {
    default: {
      name: '기본',
      description: '탈리 라이트의 표준 색상 구성입니다.',
    },
    'yellow-pink': {
      name: '노랑-분홍',
      description: '적록색약(제1색약, 제2색약) 사용자를 위해 대비를 높인 구성입니다.',
    },
  },

  mixerSelection: {
    title: '비디오 믹서',
    description: '사용할 비디오 믹서를 선택하세요.',
  },

  mixers: {
    null: '사용 안 함',
    atem: 'ATEM (Blackmagic Design)',
    mock: '테스트용 내장 목(Mock)',
    obs: 'OBS Studio',
    rolandV8HD: 'Roland V-8HD',
    rolandV60HD: 'Roland V-60HD',
    feelworld: 'Feelworld',
    test: '테스트 믹서',
    vmix: 'vMix',
  },

  atem: {
    title: 'ATEM 설정',
    description: '네트워크로 ATEM 장비에 연결합니다.',
    ip: 'ATEM IP',
    port: 'ATEM 포트',
  },

  obs: {
    title: 'OBS Studio 설정',
    // Korean puts the requirement clause first; the link lands where the
    // sentence needs it, not where English put it.
    description: (link) => <>네트워크로 OBS Studio에 연결합니다. {link('obs-websocket 버전 5')}가 필요하며, OBS 28 이상에는 기본 탑재되어 있습니다. 플러그인 버전 4는 더 이상 지원하지 않습니다.</>,
    ip: 'OBS IP',
    port: 'OBS 포트',
    portWarning: 'OBS 28 이상은 4455를 사용합니다',
    password: 'OBS 비밀번호',
    passwordWarning: '인증을 사용하지 않으면 비워 두세요',
    onAirStatus: 'ON AIR 판정 기준',
    liveMode: {
      always: '항상',
      alwaysHelp: '',
      stream: '스트리밍 중일 때만',
      streamHelp: 'OBS가 스트리밍 중일 때만 탈리 라이트에 ON AIR가 표시됩니다.',
      record: '녹화 중일 때만',
      recordHelp: 'OBS가 녹화 중일 때만 탈리 라이트에 ON AIR가 표시됩니다.',
      streamOrRecord: '녹화 또는 스트리밍 중일 때',
      streamOrRecordHelp: 'OBS가 녹화 또는 스트리밍 중일 때만 탈리 라이트에 ON AIR가 표시됩니다.',
    },
  },

  vmix: {
    title: 'vMix',
    description: (link) => <>{link('TCP API')}를 사용해 네트워크로 vMix에 연결합니다.</>,
    ip: 'vMix IP',
    port: 'vMix 포트',
    portWarning: '이 설정으로는 동작하지 않을 가능성이 큽니다. 웹 UI 포트를 입력하셨는데, 필요한 것은 TCPAPI 포트입니다. 무슨 뜻인지 모르겠다면 비워 두어 기본값을 사용하세요.',
  },

  rolandV60HD: {
    title: 'Roland V-60HD SmartTally',
    description: 'Roland SmartTally를 지원하는 Roland V-60HD 믹서입니다',
    ip: 'IP',
    port: '포트',
    requestInterval: '요청 간격',
  },

  rolandV8HD: {
    title: 'Roland V-8HD',
    description: 'USB-MIDI로 연결하는 Roland V-8HD 믹서입니다',
    requestInterval: '요청 간격',
  },

  feelworld: {
    title: 'Feelworld (실험적, 미검증)',
    description: 'UDP로 동작하는 Feelworld 스위처 탈리입니다. 실제 Feelworld 하드웨어로는 아직 검증하지 않았으며, 개발 빌드에서만 표시됩니다.',
    ip: 'IP',
    port: '포트',
    requestInterval: '요청 간격',
  },

  nullMixer: {
    title: '믹서 사용 안 함',
    description: '사용 안 함',
  },

  testMixer: {
    title: '테스트 설정',
    description: '자동 테스트에 사용하는 믹서입니다. 직접 선택할 일은 없습니다.',
  },

  mockMixer: {
    title: '목(Mock) 설정',
    description: '일정한 간격으로 채널을 무작위로 바꿔 비디오 믹서를 흉내 냅니다. 믹서가 없는 개발 환경을 위한 것이며, 실제 운용에는 쓰지 마세요.',
    tickTime: '전환 간격',
    channelCount: '채널 수',
    channelNames: '채널 이름',
  },

  flasher: {
    title: '탈리 플래셔',
    intro: '하드웨어 탈리 라이트의 설정이나 소프트웨어를 업데이트하는 도구입니다.',
    reload: '새로고침',
    uploadDialogTitle: '업로드',
    uploadFailed: '업로드에 실패했습니다. 탈리를 뽑았다가 다시 연결한 뒤 시도하세요.',
    softwareUpdate: '소프트웨어 업데이트',
    firmwareNotAvailable: '이 허브에는 펌웨어가 포함되어 있지 않습니다',
    firmwareNotAvailableBody:
      '이 허브 빌드에는 탈리 펌웨어가 들어 있지 않아 소프트웨어 업데이트를 확인하거나 설치할 수 없습니다. 아래의 tally-settings.ini 편집은 정상적으로 동작합니다.',
    lookedIn: '확인한 경로:',
    releasePackage: '(릴리스 패키지)',
    developmentCheckout: (code) => <>(개발 체크아웃 — {code('make build')} 실행)</>,
    installRelease: '펌웨어 업데이트를 사용하려면 vTally 릴리스 빌드를 설치하세요.',
    docs: '문서 ↗',
    upToDate: '이 탈리의 소프트웨어는 최신입니다.',
    updateable: '이 탈리의 소프트웨어를 업데이트할 수 있습니다.',
    updateNow: '지금 업데이트',
    editSettingsIni: 'tally-settings.ini 편집',
    iniWillBeCreated: 'tally-settings.ini 파일이 아직 없어 새로 만들어집니다.',
    progressLabel: '플래시 진행 상황',
    steps: {
      initializing: '초기화 중',
      establishingConnection: '연결하는 중',
      uploadingFiles: '파일 업로드 중',
      uploadingIni: 'tally-settings.ini 업로드 중',
      rebooting: '설정 적용을 위해 탈리 재시작 중',
      uploadDone: '업로드 완료',
      tallyConnected: '탈리가 허브에 연결됨',
    },
  },

  flasherHelp: {
    noDevice: '연결된 장치를 찾지 못했습니다.',
    possibleFixes: '해결 방법',
    fixPlugUsb: '허브를 실행 중인 컴퓨터에 탈리를 USB로 연결하세요.',
    fixRemote: (em) => <>탈리는 허브를 {em('직접 실행 중인')} 컴퓨터에 연결해야 합니다. {em('원격 컴퓨터')}에서는 동작하지 않습니다.</>,
    fixDataCable: (em) => <>충전 전용 USB 케이블도 있습니다. {em('데이터 전송용 USB 케이블')}인지 확인하세요.</>,
    fixDrivers: (link) => <>이 컴퓨터에서 한 번도 동작한 적이 없다면 {link('USB 드라이버')}가 설치되지 않았을 수 있습니다.</>,
    noLua: '장치를 찾았지만 LUA 실행 여부를 확인하지 못했습니다.',
    fixSporadic: '간헐적으로 발생합니다. 다시 시도하면 해결될 수 있습니다.',
    fixFlashFirmware: '펌웨어가 플래시되어 있는지 확인하세요. 예를 들어 esptool을 사용할 수 있습니다.',
    fixResetButton: '탈리의 오류 코드로 펌웨어가 중단되기도 합니다. 리셋 버튼을 눌러 보세요.',
    deviceOn: '장치 위치',
  },

  settingsIni: {
    expertMode: '전문가 모드',
    expertModeHelp: '전문가 모드에서는 파일의 모든 키가 보입니다. 여기서 바꾸는 값과 간단 모드에서 바꾸는 값은 같은 설정입니다.',
    fileName: 'tally-settings.ini',
    name: '이름',
    ssid: 'SSID',
    password: '비밀번호',
    hubIp: '허브 IP',
    hubPort: '허브 포트',
    showPassword: '비밀번호 표시',
    hidePassword: '비밀번호 숨기기',
  },

  webTally: {
    waitingForData: '데이터 기다리는 중',
    highlight: '하이라이트',
    onProgram: 'ON AIR',
    onPreview: '프리뷰',
    idle: '대기',
    noMixerConnection: '믹서에 연결되지 않음',
    disconnected: '연결 끊김 — 다시 연결하는 중',
    showSettings: '설정 열기',
    enterFullscreen: '전체 화면',
    exitFullscreen: '전체 화면 종료',
    notFound: (name, strong) => <>{strong(name)} 이름의 탈리를 찾을 수 없습니다.</>,
  },

  log: {
    title: (name: string) => `${name} · 로그`,
    titleNoTally: '로그',
    severityFilter: '심각도 필터',
    filterAll: '전체',
    filterProblems: '경고 및 오류',
    filterErrors: '오류',
    searchLabel: '로그 메시지 검색',
    searchPlaceholder: '검색…',
    tallyNotFound: (id, link) => <>'{id}' 탈리를 찾을 수 없습니다. 삭제되었을 수 있습니다. {link('탈리 목록으로 돌아가기')}</>,
    noEntries: '아직 로그가 없습니다.',
    noEntriesHint: '탈리가 연결되거나 상태를 보고하거나 오류가 나면 여기에 기록됩니다.',
    noMatch: (button) => <>현재 필터와 일치하는 줄이 없습니다. {button('필터 지우기')}</>,
    newCount: (n: number) => `↓ 새 ${n}줄`,
    lineCount: (total: number) => `${total}줄`,
    showingCount: (n: number) => ` · ${n}줄 표시`,
  },

  brightness: {
    label: '밝기',
    valueText: (v: number) => (v === 0 ? '꺼짐' : `${v} 퍼센트`),
    bubble: (v: number) => (v === 0 ? '꺼짐' : `${v}%`),
  },

  notFound: {
    title: '페이지를 찾을 수 없습니다',
  },
}

export default ko
