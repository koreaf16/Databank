// 채널↔메뉴 컨텍스트 전달용 전역 Context
// 채널 화면에서 다른 메뉴로 이동할 때 고객사 필터를 자동 적용하기 위해 사용

import React from 'react';

const ChannelContext = React.createContext(null);

export function ChannelProvider({ channel, nav, setNav, setChannel, children }) {
  const value = React.useMemo(() => ({
    channel,
    nav,
    setNav,
    setChannel,
    // 채널에서 메뉴로 이동할 때 컨텍스트 유지
    navWithContext: (nextNav) => {
      setNav(nextNav);
    },
    clearContext: () => {
      setChannel(null);
    },
  }), [channel, nav, setNav, setChannel]);

  return (
    <ChannelContext.Provider value={value}>
      {children}
    </ChannelContext.Provider>
  );
}

export function useChannelContext() {
  return React.useContext(ChannelContext);
}
