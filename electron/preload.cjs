const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fileFinder', {
  getFolders: () => ipcRenderer.invoke('folders:get'),
  selectFolder: () => ipcRenderer.invoke('folders:select'),
  removeFolder: (folderPath) => ipcRenderer.invoke('folders:remove', folderPath),
  saveFolders: (folders) => ipcRenderer.invoke('folders:save', folders),
})
