const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fileFinder', {
  getFolders: () => ipcRenderer.invoke('folders:get'),
  selectFolder: () => ipcRenderer.invoke('folders:select'),
  removeFolder: (folderPath) => ipcRenderer.invoke('folders:remove', folderPath),
  saveFolders: (folders) => ipcRenderer.invoke('folders:save', folders),

  getIndexStatus: () => ipcRenderer.invoke('index:getStatus'),
  reindex: (folderPath) => ipcRenderer.invoke('index:reindex', folderPath),
  clearIndex: () => ipcRenderer.invoke('index:clear'),

  onIndexProgress: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('index:progress', listener)
    return () => {
      ipcRenderer.removeListener('index:progress', listener)
    }
  },
})
