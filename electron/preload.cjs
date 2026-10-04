const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fileFinder', {
  getFolders: () => ipcRenderer.invoke('folders:get'),
  selectFolder: () => ipcRenderer.invoke('folders:select'),
  removeFolder: (folderPath) => ipcRenderer.invoke('folders:remove', folderPath),

  getIndexStatus: () => ipcRenderer.invoke('index:getStatus'),
  reindex: (folderPath) => ipcRenderer.invoke('index:reindex', folderPath),
  clearIndex: () => ipcRenderer.invoke('index:clear'),

  getSearchOptions: () => ipcRenderer.invoke('search:options'),
  searchFiles: (options) => ipcRenderer.invoke('search:query', options),
  openFile: (fullPath) => ipcRenderer.invoke('file:open', fullPath),
  openFolder: (fullPath) => ipcRenderer.invoke('file:openFolder', fullPath),
  copyPath: (fullPath) => ipcRenderer.invoke('file:copyPath', fullPath),
  getFilePreview: (fullPath, size) => ipcRenderer.invoke('file:preview', fullPath, size),
  suggestOrganization: (fullPaths) => ipcRenderer.invoke('organization:suggest', fullPaths),
  moveOrganizedFile: (fullPath, destinationRootPath, categoryPath) =>
    ipcRenderer.invoke('organization:move', fullPath, destinationRootPath, categoryPath),
  undoOrganizedMove: (undoToken) => ipcRenderer.invoke('organization:undo', undoToken),

  getAiStatus: () => ipcRenderer.invoke('ai:getStatus'),
  analyzeFilesWithAi: () => ipcRenderer.invoke('ai:analyze'),

  onIndexProgress: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('index:progress', listener)
    return () => {
      ipcRenderer.removeListener('index:progress', listener)
    }
  },
  onAiProgress: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('ai:progress', listener)
    return () => ipcRenderer.removeListener('ai:progress', listener)
  },
})
