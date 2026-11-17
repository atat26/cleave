// When you allow the internet for an HTML artifact's preview, which addresses the
// page may reach. Only secure ones (https, or wss for live connections) on ordinary
// ports and on public websites: never your own computer, your home or office
// network, or an address with a password in it (a page must not be able to knock on
// your router or a machine on your network). Pure code, so it is easy to test; the
// app also checks what a name really points at (see previewGuard.ts).
import { checkPublicAddress } from './addressSafety.ts';

// May the page in a preview that has the internet allowed reach this address?
export function previewAddressAllowed(raw: string): boolean {
  let address = raw;
  if (/^wss:/i.test(address)) address = 'https:' + address.slice(4);
  else if (!/^https:/i.test(address)) return false;
  return checkPublicAddress(address).ok;
}
