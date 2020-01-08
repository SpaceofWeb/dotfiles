import saveAs from 'file-saver';

const openDatabase = dbVersion => new Promise((resolve, reject) => {
  const operation = window.indexedDB.open('dhcDb', dbVersion);
  operation.onsuccess = event => resolve(event.target.result);
  operation.onerror = reject;
});

const getAllFromStore = (db, storeName) => new Promise(((resolve, reject) => {
  const operation = db.transaction(storeName, 'readonly')
    .objectStore(storeName)
    .getAll();

  operation.onsuccess = event => resolve(event.target.result);
  operation.onerror = reject;
}));

const backupStore = async (dbVersion, storeName) => {
  const db = await openDatabase(dbVersion);
  return getAllFromStore(db, storeName);
};

const backupStoreToFile = async (dbVersion, storeName, fileName) => {
  const storeBackup = await backupStore(dbVersion, storeName);
  const fileContent = { storeName, content: storeBackup };
  const fileContentAsString = JSON.stringify(fileContent, null, 2);
  const blobContent = new Blob([ fileContentAsString ], { type: 'application/json' });
  return saveAs(blobContent, fileName);
};

const blobToString = blob => new Promise(((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsText(blob);
}));

const storeAllInStore = async (db, storeName, content) => {
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);

  const promises = content.map(entry => new Promise(((resolve, reject) => {
    const operation = store.put(entry);
    operation.onsuccess = event => resolve(event.target.result);
    operation.onerror = reject;
  })));

  return Promise.all(promises);
};

const restoreStoreFromFile = async (dbVersion, blob) => {
  const stringContent = await blobToString(blob);
  const { storeName, content } = JSON.parse(stringContent);
  const db = await openDatabase(dbVersion);
  await storeAllInStore(db, storeName, content);
};

window.APP.dbBackupRestoreService = {
  backupStore,
  backupStoreToFile,
  restoreStoreFromFile,
};
