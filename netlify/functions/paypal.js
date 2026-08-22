// J. POCA Books - PayPal checkout engine
// Lives at netlify/functions/paypal.js
// Two jobs: create a PayPal order from the cart, then capture the money after approval.

const PAYPAL_BASE = 'https://api-m.paypal.com'; // live

async function getAccessToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  const auth = Buffer.from(id + ':' + secret).toString('base64');
  const res = await fetch(PAYPAL_BASE + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  return data.access_token;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const token = await getAccessToken();

    // STEP 1: create the order
    if (body.action === 'create') {
      const items = body.items || [];
      if (!items.length) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Cart is empty' }) };
      }

      let itemTotal = 0;
      const paypalItems = items.map(function (it) {
        itemTotal += it.price * it.qty;
        return {
          name: (it.title + ' (' + it.fmt + ')').slice(0, 127),
          quantity: String(it.qty),
          unit_amount: { currency_code: 'USD', value: it.price.toFixed(2) },
          category: it.ship ? 'PHYSICAL_GOODS' : 'DIGITAL_GOODS'
        };
      });

      const hasPaper = items.some(function (it) { return it.ship; });
      const shipping = hasPaper ? 5.99 : 0;
      const grandTotal = itemTotal + shipping;

      const order = await fetch(PAYPAL_BASE + '/v2/checkout/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            amount: {
              currency_code: 'USD',
              value: grandTotal.toFixed(2),
              breakdown: {
                item_total: { currency_code: 'USD', value: itemTotal.toFixed(2) },
                shipping: { currency_code: 'USD', value: shipping.toFixed(2) }
              }
            },
            items: paypalItems
          }]
        })
      });
      const orderData = await order.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderData.id })
      };
    }

    // STEP 2: capture the money after buyer approves
    if (body.action === 'capture') {
      const cap = await fetch(PAYPAL_BASE + '/v2/checkout/orders/' + body.orderID + '/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        }
      });
      const capData = await cap.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capData)
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
