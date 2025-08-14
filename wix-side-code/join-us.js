import wixData from 'wix-data';
import wixWindow from 'wix-window';
import { isEmailUnique } from 'backend/emailUnique.jsw';

const MEMBERS_COLL = 'contact043';
const EMAIL_FIELD_KEY = 'email2';                // field key from Manage Fields
const ADDRESS_FIELD_LABEL = 'Select an Address'; // or 'Adres korespondencyjny'

// ---------- helpers ----------
function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }
function isValidEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e||'').trim()); }

function hasStructuredAddress(addr){
  // Be strict: must be an object with a formatted string and numeric lat/lng
  return !!(
    addr && typeof addr === 'object' &&
    typeof addr.formatted === 'string' && addr.formatted.trim().length > 0 &&
    addr.location &&
    typeof addr.location.latitude === 'number' &&
    typeof addr.location.longitude === 'number'
  );
}

function showAddressError(msg){
  $w('#addressError').text = msg;
  $w('#addressError').show();
}
function hideAddressError(){ $w('#addressError').hide(); }

// ---------- state ----------
let emailFormatOk = false;
let emailUniqueOk = false;
let addrOk = false;
let emailCheckInFlight = false;

function refreshSubmitState(){
  // Button is enabled only when all validations pass and no async check in flight
  const enable = emailFormatOk && emailUniqueOk && addrOk && !emailCheckInFlight;
  if (enable) $w('#button6').enable(); else $w('#button6').disable();
}

// ---------- page ----------
$w.onReady(() => {
  $w('#emailError').hide();
  hideAddressError();
  $w('#button6').disable(); // start disabled

  // Live email check (format + uniqueness via backend)
  $w('#input7').onInput(debounce(async () => {
    const raw = $w('#input7').value || '';
    const email = raw.trim().toLowerCase();

    // format
    emailFormatOk = isValidEmail(email);
    if (!emailFormatOk){
      $w('#emailError').text = 'Enter a valid email.';
      $w('#emailError').show();
      emailUniqueOk = false;     // dependent on format
      refreshSubmitState();
      return;
    }

    // uniqueness
    try {
      emailCheckInFlight = true;
      refreshSubmitState();
      const unique = await isEmailUnique(email);
      emailUniqueOk = !!unique;
      if (!emailUniqueOk){
        $w('#emailError').text = 'This email is already registered.';
        $w('#emailError').show();
      } else {
        $w('#emailError').hide();
      }
    } catch (e) {
      console.error('dup check failed:', e);
      // Fail-safe: keep disabled if check fails
      emailUniqueOk = false;
    } finally {
      emailCheckInFlight = false;
      refreshSubmitState();
    }
  }, 350));

  // Address selection enforcement (fires only when a suggestion is actually picked)
  $w('#addressInput1').onChange(() => {
    const addr = $w('#addressInput1').value;
    addrOk = hasStructuredAddress(addr);
    if (!addrOk){
      showAddressError('Please pick an address from the suggestions.');
    } else {
      hideAddressError();
    }
    refreshSubmitState();
  });

  // Submit
  $w('#button6').onClick(async () => {
    // final guards (don’t trust prior UI state)
    const raw = $w('#input7').value || '';
    const email = raw.trim().toLowerCase();

    emailFormatOk = isValidEmail(email);
    if (!emailFormatOk){
      $w('#emailError').text = 'Enter a valid email.'; $w('#emailError').show();
      refreshSubmitState(); return;
    }

    try {
      emailCheckInFlight = true; refreshSubmitState();
      emailUniqueOk = await isEmailUnique(email);
    } finally {
      emailCheckInFlight = false; refreshSubmitState();
    }
    if (!emailUniqueOk){
      $w('#emailError').text = 'This email is already registered.'; $w('#emailError').show();
      return;
    } else {
      $w('#emailError').hide();
    }

    const addrObj = $w('#addressInput1').value;
    addrOk = hasStructuredAddress(addrObj);
    if (!addrOk){
      showAddressError('Please pick an address from the suggestions.');
      refreshSubmitState(); return;
    } else {
      hideAddressError();
    }

    // Build item for contact043 (text address)
    const formatted = addrObj.formatted || '';
    const item = {
      'First Name':       $w('#input5').value?.trim(),
      'Last Name':        $w('#input8').value?.trim(),
      'Birthday':         $w('#datePicker1').value,
      [EMAIL_FIELD_KEY]:  email,                       // store lowercase
      'Phone Number':     $w('#input11').value?.trim(),
      [ADDRESS_FIELD_LABEL]: formatted                 // app collection stores TEXT
    };

    try {
      await wixData.insert(MEMBERS_COLL, item);
      wixWindow.openLightbox('SignupSuccess');
    } catch (err) {
      console.error(err);
      wixWindow.openLightbox('SignupFailure', { reason: String(err?.message || err) });
    }
  });
});
