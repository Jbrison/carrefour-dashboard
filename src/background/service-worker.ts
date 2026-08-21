chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!isOpenSidePanelMessage(message)) return false
  const tabId = sender.tab?.id
  if (tabId !== undefined) {
    void chrome.sidePanel.open({ tabId })
    return false
  }
  const windowId = sender.tab?.windowId
  if (windowId !== undefined) {
    void chrome.sidePanel.open({ windowId })
  }
  return false
})

function isOpenSidePanelMessage(message: unknown): message is { type: "OPEN_SIDE_PANEL" } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "OPEN_SIDE_PANEL"
}
