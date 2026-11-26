import { WorkflowError } from './workflow.mjs';

export const fileLimit = 2_000_000;
const imageTypes = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
};

export function decodeFile(data) {
  if (typeof data !== 'string' || data.length > Math.ceil(fileLimit / 3) * 4) throw new WorkflowError('Choose a file under 2 MB.');
  try {
    return Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
  } catch {
    throw new WorkflowError('Choose a valid PDF, JPEG, or PNG file.');
  }
}

export function encodeFile(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export async function evidenceFile({ bytes, name, mime, order, id }) {
  if (!order) throw new WorkflowError('Choose the work order printed on the document.');
  const magic = imageTypes[mime];
  if (!magic || !bytes?.length || !magic.every((byte, index) => bytes[index] === byte)) {
    throw new WorkflowError('Choose a valid PDF, JPEG, or PNG file.');
  }
  if (bytes.length > fileLimit) throw new WorkflowError('Choose a file under 2 MB.');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha256 = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const cleanName = String(name).split(/[/\\]/).pop().replace(/[^a-zA-Z0-9._ -]/g, '_').slice(-100);
  const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[mime];
  // Salesforce infers the file type from PathOnClient.
  const filename = cleanName.replace(/\.[^.]*$/, '').replace(/^\.+/, '').trim() || 'signed-work-order';
  return {
    id, name: filename + extension, mime, orderId: order.id, serial: order.serial,
    sha256, size: bytes.length, data: encodeFile(bytes),
  };
}
