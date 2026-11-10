import {database} from './database';
import type {Person,BasarEvent} from './domain';
import {ApiError} from './operations';

export const personColumns='id,name,role,event_id,till_number,auth_version';
export function assertEventAccess(user:Person,eventId:string) {
  if(user.role==='manager'&&!user.event_id)return;
  if(!user.event_id||user.event_id!==eventId)throw new ApiError('Diese Anmeldung gehört zu einem anderen Basar.',403,'SCOPE_MISMATCH');
  if(user.role==='cashier'&&!Number.isInteger(user.till_number))throw new ApiError('Für diese Person ist noch keine Kasse zugewiesen.',403,'SCOPE_MISMATCH');
}
export function assertTillAccess(user:Person,number:number) {
  if(user.role==='cashier'&&user.till_number!==number)throw new ApiError('Diese Anmeldung gehört zu einer anderen Kasse.',403,'SCOPE_MISMATCH');
}
export async function currentPerson(user:Person) {
  const current=await database().prepare('SELECT '+personColumns+' FROM staff WHERE id=? AND disabled=0').bind(user.id).first<Person>();
  if(!current||(current.auth_version??0)!==(user.auth_version??0))throw new ApiError('Die Anmeldung wurde geändert. Bitte erneut anmelden.',401,'AUTH_REQUIRED');
  return current;
}
export async function visibleContext(eventId:string|undefined,user:Person|null) {
  if(user?.event_id){if(eventId&&eventId!==user.event_id)throw new ApiError('Diese Anmeldung gehört zu einem anderen Basar.',403,'SCOPE_MISMATCH');eventId=user.event_id;}
  const all=(await database().prepare('SELECT * FROM events ORDER BY created_at DESC').all<BasarEvent>()).results;
  const selected=all.find(event=>event.id===eventId)||(!eventId?all[0]:undefined);
  if(!selected)throw new ApiError('Die Veranstaltung wurde nicht gefunden.',404);
  if(user)assertEventAccess(user,selected.id);
  const events=user?.role==='manager'&&!user.event_id?all:[selected];
  const staff=(await database().prepare('SELECT '+personColumns+' FROM staff WHERE disabled=0 AND (event_id=? OR (role=\'manager\' AND event_id IS NULL)) ORDER BY role DESC,name').bind(selected.id).all<Person>()).results;
  return {events,event:selected,staff:user?.role==='cashier'?[user]:staff};
}
