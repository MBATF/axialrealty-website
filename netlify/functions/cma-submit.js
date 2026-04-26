const { execSync } = require('child_process');

function callTool(sourceId, toolName, args) {
  const payload = JSON.stringify({ source_id: sourceId, tool_name: toolName, arguments: args });
  // Escape single quotes in payload
  const escaped = payload.replace(/'/g, "'\\''");
  const result = execSync(`external-tool call '${escaped}'`, { timeout: 30000 }).toString();
  return JSON.parse(result);
}

exports.handler = async function(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse form body (application/x-www-form-urlencoded or JSON)
    let fields = {};
    const contentType = (event.headers['content-type'] || '').toLowerCase();

    if (contentType.includes('application/json')) {
      fields = JSON.parse(event.body);
    } else {
      // URL-encoded
      const params = new URLSearchParams(event.body);
      params.forEach((v, k) => { fields[k] = v; });
    }

    const name        = fields.name        || '(not provided)';
    const email       = fields.email       || '(not provided)';
    const phone       = fields.phone       || '(not provided)';
    const address     = fields.address     || '(not provided)';
    const appraisal   = fields.appraisal   || '(not provided)';
    const notes       = fields.notes       || '';

    const subject = `New CMA Request — ${name} — ${address}`;

    const body =
`New CMA / Tax Protest request submitted from axialrealty.com

──────────────────────────────
CLIENT DETAILS
──────────────────────────────
Name:              ${name}
Email:             ${email}
Phone:             ${phone}

──────────────────────────────
PROPERTY
──────────────────────────────
Address:           ${address}
Appraisal Value:   ${appraisal}

──────────────────────────────
ADDITIONAL NOTES
──────────────────────────────
${notes || '(none)'}

──────────────────────────────
Submitted via axialrealty.com/cma.html
`;

    // Send via Gmail connector
    callTool('gcal', 'send_email', {
      action: {
        action: 'send',
        to: ['davidtung@axialrealty.com'],
        cc: [],
        bcc: [],
        subject: subject,
        body: body,
      }
    });

    // Return success — redirect to thank-you or return JSON
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };

  } catch (err) {
    console.error('CMA submit error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
