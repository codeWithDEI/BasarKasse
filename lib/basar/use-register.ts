'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {basePath} from './paths';
import {emptyRegister,loadRegister,saveRegister,registerKey,type RegisterRecord} from './register';

export function useRegister() {
  const [record,setRecord]=useState<RegisterRecord>(emptyRegister);
  const current=useRef(record);
  const owned=useRef(false);
  const [ready,setReady]=useState(false);
  const [storageError,setStorageError]=useState('Kassenspeicher wird geprüft …');
  const key=registerKey(basePath);
  useEffect(()=>{
    const controller=new AbortController();let release=()=>{};let active=true;
    if(!navigator.locks || typeof AbortSignal.timeout!=='function') {setStorageError('Dieser Browser unterstützt die sichere Kassensperre nicht. Bitte einen aktuellen Browser und HTTPS verwenden.');return;}
    setStorageError('Diese Kasse wird möglicherweise in einem anderen Tab verwendet. Bitte weitere Basarkasse-Tabs schließen.');
    navigator.locks.request(key,{signal:controller.signal},async()=>{
      if(!active)return;
      try {
        const loaded=loadRegister(localStorage,key);
        // Verify that writes are possible even when a previous record already exists.
        saveRegister(localStorage,key,loaded);
        current.current=loaded;setRecord(loaded);owned.current=true;setReady(true);setStorageError('');
        await new Promise<void>(resolve=>{release=resolve;});
      } catch(error) {setStorageError(error instanceof Error?error.message:'Der Kassenspeicher ist nicht verfügbar.');}
      finally {owned.current=false;}
    }).catch(error=>{if(active && error.name!=='AbortError')setStorageError('Der Kassenspeicher konnte nicht gesperrt werden. Bitte die Kassenleitung hinzuziehen.');});
    const changed=(event:StorageEvent)=>{if(owned.current && (event.key===key||event.key===null)){owned.current=false;setReady(false);setStorageError('Der Kassenspeicher wurde außerhalb dieses Tabs verändert. Bitte die Kassenleitung hinzuziehen.');}};
    window.addEventListener('storage',changed);
    return()=>{active=false;owned.current=false;controller.abort();release();window.removeEventListener('storage',changed);};
  },[key]);
  const update=useCallback((change:(record:RegisterRecord)=>RegisterRecord)=>{
    if(!owned.current) return false;
    try {
      const next={...change(current.current),revision:current.current.revision+1};
      saveRegister(localStorage,key,next);
      current.current=next;setRecord(next);return true;
    } catch(error) {
      owned.current=false;setReady(false);setStorageError('Der Kassenstand konnte nicht sicher gespeichert werden. Keine weitere Buchung senden. Bitte die Kassenleitung hinzuziehen.');return false;
    }
  },[key]);
  return {record,current,ready,storageError,update};
}
