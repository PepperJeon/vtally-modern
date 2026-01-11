# vTally Modern - Modernized WiFi Tally Light ⚡

[English](#english) | [한국어](#korean)

> **현대화된 vTally**: 원본 [wifi-tally](https://github.com/wifi-tally/wifi-tally)를 전면 현대화
> 🚀 200배 빠른 개발 | ⚡ Electron 데스크톱 앱 | 🎨 React 19 + Tailwind

---

<a name="korean"></a>
## 🇰🇷 한국어

### ✨ 주요 개선사항 (v1.0.0)

#### 🚀 성능 (200-400배 향상!)
- 개발 서버 시작: 30-60초 → **151ms** (200-400배 빠름!)
- 프로덕션 빌드: **2.87초**
- Vite 5.4.21 초고속 HMR (Hot Module Replacement)

#### 💻 현대 기술 스택
- **Vite 5.4.21** (Create React App 대체)
- **Electron 33** 데스크톱 앱
- **React 19.2.3** 최신 기능
- **Tailwind CSS + shadcn/ui** 현대적 디자인 시스템
- **Node.js 24 LTS** 최신 런타임
- **Vitest** 테스트 프레임워크 (97.6% 통과율)
- **다크 모드** 지원

#### 🐛 버그 수정
- 스위처별 독립 메모리 구현 (Mock ↔ OBS 전환 시 데이터 격리)
- 네비게이션 바 레이아웃 최적화

### 📦 주요 기능

vTally는 ESP8266 기반의 오픈소스 WiFi Tally Light입니다.
저렴한 비용(~€10)으로 신뢰성 있는 Tally 시스템을 구축할 수 있습니다.

- **WiFi Tally Light** (ESP8266 기반, 하드웨어 비용 약 €10)
- **유연한 USB 전원** (배터리 팩, 카메라 출력, 정전식 모두 가능)
- **빠른 통신** 및 경량 프로토콜
- **중앙 Hub 방식** 모니터링 및 관리 용이
- **RGB LED, WS2812, NeoPixel** 등 다양한 LED 지원
- **Web Tally** (스마트폰, 태블릿을 Tally로 활용)
- **오픈 소스 / 오픈 하드웨어**

### 🎬 지원 비디오 믹서

- **OBS Studio**
- **Blackmagic ATEM**
- **VMix**
- **Roland V-60HD / V-8HD**
- **Feelworld**
- **Mock** (테스트용)

### 🚀 빠른 시작

```bash
# 레포지토리 클론
git clone https://github.com/peperjeon/vtally-modern.git
cd vtally-modern/hub

# 의존성 설치
npm install

# 개발 모드 실행 (Electron 앱)
npm run dev

# 테스트 실행
npm test -- --run

# 프로덕션 빌드
npm run build
npm run build:backend
```

### 📚 문서

- **전체 문서**: [wifi-tally.github.io](https://wifi-tally.github.io/)
- **변경 이력**: [Changelog.md](./Changelog.md)
- **개발 상태**: [STATUS.md](./STATUS.md)
- **퀵스타트**: [QUICKSTART.md](./QUICKSTART.md)

### 🙏 크레딧

- **원본 vTally**: [wifi-tally/wifi-tally](https://github.com/wifi-tally/wifi-tally)
- **현대화 작업**: [@peperjeon](https://github.com/peperjeon)

### 📄 라이선스

MIT License - 자세한 내용은 [LICENSE](./LICENSE) 참조

---

<a name="english"></a>
## 🇺🇸 English

### ✨ Key Improvements (v1.0.0)

#### 🚀 Performance (200-400x Faster!)
- Dev server start: 30-60s → **151ms** (200-400x improvement!)
- Production build: **2.87 seconds**
- Vite 5.4.21 ultra-fast HMR (Hot Module Replacement)

#### 💻 Modern Tech Stack
- **Vite 5.4.21** (replaces Create React App)
- **Electron 33** desktop application
- **React 19.2.3** with latest features
- **Tailwind CSS + shadcn/ui** modern design system
- **Node.js 24 LTS** latest runtime
- **Vitest** testing framework (97.6% pass rate)
- **Dark mode** support

#### 🐛 Bug Fixes
- Mixer-specific independent memory (data isolation when switching Mock ↔ OBS)
- Navigation bar layout optimization

### 📦 Features

vTally is an Open Source WiFi Tally Light based on the ESP8266.
It aims to be affordable without sacrificing reliability.

- **WiFi Tally Light** (ESP8266-based, ~€10 hardware cost)
- **Flexible USB power** (battery pack, camera outlet, stationary)
- **Fast communication** and lightweight protocol
- **Central Hub architecture** for easy monitoring and configuration
- **RGB LED, WS2812, NeoPixel** support
- **Web Tally** (turn any smartphone/tablet into a Tally)
- **Open Source / Open Hardware**

### 🎬 Supported Video Mixers

- **OBS Studio**
- **Blackmagic ATEM**
- **VMix**
- **Roland V-60HD / V-8HD**
- **Feelworld**
- **Mock** (for testing)

### 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/peperjeon/vtally-modern.git
cd vtally-modern/hub

# Install dependencies
npm install

# Run development mode (Electron app)
npm run dev

# Run tests
npm test -- --run

# Production build
npm run build
npm run build:backend
```

### 📚 Documentation

- **Full Documentation**: [wifi-tally.github.io](https://wifi-tally.github.io/)
- **Changelog**: [Changelog.md](./Changelog.md)
- **Development Status**: [STATUS.md](./STATUS.md)
- **Quick Start Guide**: [QUICKSTART.md](./QUICKSTART.md)

### 🙏 Credits

- **Original vTally**: [wifi-tally/wifi-tally](https://github.com/wifi-tally/wifi-tally)
- **Modernization**: [@peperjeon](https://github.com/peperjeon)

### 📄 License

MIT License - See [LICENSE](./LICENSE) for details

---

![Build Status](https://github.com/wifi-tally/wifi-tally/workflows/build/badge.svg)
[![Cypress Tests](https://img.shields.io/endpoint?url=https://dashboard.cypress.io/badge/detailed/1qd2ua/master&style=flat&logo=cypress)](https://dashboard.cypress.io/projects/1qd2ua/runs)

![GitHub last commit](https://img.shields.io/github/last-commit/peperjeon/vtally-modern)
![GitHub Release Date](https://img.shields.io/github/release-date-pre/peperjeon/vtally-modern?label=latest%20release)
