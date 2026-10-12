// formurl.js — turns whatever Google Form link a professor pastes into the
// address the exam page needs (…/viewform?embedded=true).
//
// Accepted:
//   https://docs.google.com/forms/d/e/<id>/viewform            (the normal "Send > link")
//   https://docs.google.com/forms/d/e/<id>/viewform?usp=...    (extra parameters are dropped)
//   https://forms.gle/<code>                                    (short link, followed to the real address)
//   <iframe src="…"> embed code                                 (the src is used)
// Not accepted: editor links (…/d/<id>/edit) — students cannot open those.

class FormUrlError extends Error {}

function pullFromEmbedCode(text) {
  const m = String(text).match(/src\s*=\s*["']([^"']+)["']/i);
  return (m ? m[1] : String(text)).replace(/&amp;/g, '&').trim();
}

// Works without the network. Returns the embed address, or null if the
// link is not a published Google Form address (e.g. it needs a short-link lookup).
function toEmbedUrl(input) {
  let u;
  try { u = new URL(pullFromEmbedCode(input)); } catch (err) { return null; }
  if (u.hostname !== 'docs.google.com') return null;
  const m = u.pathname.match(/^\/forms\/(?:u\/\d+\/)?d\/e\/([\w-]+)/);
  if (!m) return null;
  return `https://docs.google.com/forms/d/e/${m[1]}/viewform?embedded=true`;
}

// Same, but also follows forms.gle short links. Throws FormUrlError with a
// message the professor can act on.
async function normalizeFormUrl(input) {
  const raw = pullFromEmbedCode(input || '');
  if (!raw) throw new FormUrlError('Paste the link to your Google Form.');

  let target = raw;
  let host = '';
  try { host = new URL(raw).hostname; } catch (err) {
    throw new FormUrlError('That does not look like a link. Copy it from your Google Form (Send > link).');
  }

  if (host === 'forms.gle') {
    try {
      const res = await fetch(raw, { redirect: 'follow', signal: AbortSignal.timeout(6000) });
      target = res.url;
    } catch (err) {
      throw new FormUrlError('Could not open that short link. Paste the longer docs.google.com link instead (Send > link, untick "shorten URL").');
    }
  }

  const embed = toEmbedUrl(target);
  if (embed) return embed;

  if (/docs\.google\.com\/forms\/d\/[\w-]+\/(edit|viewanalytics)/.test(target)) {
    throw new FormUrlError('That is the editor link. Open your form, click Send, and copy the link from the "link" tab instead.');
  }
  throw new FormUrlError('Only Google Forms links are supported (they start with https://docs.google.com/forms/ or https://forms.gle/).');
}

module.exports = { normalizeFormUrl, toEmbedUrl, FormUrlError };
