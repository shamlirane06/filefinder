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

  onIndexProgress: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('index:progress', listener)
    return () => {
      ipcRenderer.removeListener('index:progress', listener)
    }
  },
})
