// J. POCA Books - purchase notifications (card checkouts)
// Stripe calls this after every paid checkout. It sends the order to the Netlify "purchase" form,
// which emails whoever is set as that form's notification address in Netlify (support@jpocabooks.com).
const Stripe = require('stripe');

async function notify(fields) {
  const origin = process.env.URL || 'https://jpocabooks.com';
  const body = new URLSearchParams(Object.assign({ 'form-name': 'purchase' }, fields)).toString();
  await fetch(origin + '/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
}

function addressLine(a) {
  if (!a) return '';
  return [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(', ');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  let evt;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return { statusCode: 400, body: 'Webhook signature failed: ' + err.message };
  }
  if (evt.type === 'checkout.session.completed') {
    const s = evt.data.object;
    let items = '';
    try {
      const li = await stripe.checkout.sessions.listLineItems(s.id, { limit: 50 });
      items = li.data.map(function (x) { return x.quantity + ' x ' + x.description; }).join('; ');
    } catch (e) { items = '(line items unavailable)'; }
    const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || null;
    const cust = s.customer_details || {};
    const shipName = ship && ship.name ? ship.name : '';
    await notify({
      method: 'Card (Stripe)',
      order: s.id,
      name: shipName || cust.name || '',
      email: cust.email || '',
      items: items,
      total: '$' + ((s.amount_total || 0) / 100).toFixed(2) + ' ' + String(s.currency || 'usd').toUpperCase(),
      'shipping-address': ship ? addressLine(ship.address) : 'Ebook only, no shipping'
    });
  }
  return { statusCode: 200, body: 'ok' };
};
