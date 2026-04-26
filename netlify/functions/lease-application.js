/**
 * Netlify Serverless Function: lease-application
 * ────────────────────────────────────────────────
 * Endpoint: POST /api/lease-application
 *
 * Receives a JSON payload with all TXR-2003 lease application fields,
 * sends a formatted HTML email notification to davidtung@axialrealty.com
 * via Web3Forms, and returns a success/error JSON response.
 *
 * DocuSign envelope sending is stubbed out as a TODO block below —
 * wire it in once a DocuSign template ID is available.
 *
 * Dependencies: none (uses built-in fetch, available in Node 18+)
 * ────────────────────────────────────────────────
 */

// ─── Configuration ───────────────────────────────────────────────────────────
const WEB3FORMS_ACCESS_KEY = '09ac0000-3fab-42b0-8fad-5cb87c7df530';
const NOTIFICATION_EMAIL   = 'davidtung@axialrealty.com';
const WEB3FORMS_API_URL    = 'https://api.web3forms.com/submit';

// ─── Handler ─────────────────────────────────────────────────────────────────
exports.handler = async function(event, context) {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  // Parse body
  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ success: false, message: 'Invalid JSON body' }),
    };
  }

  // Basic validation — require minimum fields
  const missingFields = [];
  if (!data.full_name)        missingFields.push('full_name');
  if (!data.email)            missingFields.push('email');
  if (!data.mobile_phone)     missingFields.push('mobile_phone');
  if (!data.property_address) missingFields.push('property_address');

  if (missingFields.length > 0) {
    return {
      statusCode: 422,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: false,
        message: 'Missing required fields: ' + missingFields.join(', '),
      }),
    };
  }

  // Build email HTML
  const emailHtml = buildEmailHtml(data);
  const subject   = `New Lease Application — ${data.full_name} for ${data.property_address}`;

  // ── Step 1: Send email notification via Web3Forms ──────────────────────────
  try {
    const web3Response = await fetch(WEB3FORMS_API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        subject:    subject,
        from_name:  'Axial Realty — Lease Application',
        to:         NOTIFICATION_EMAIL,
        html:       emailHtml,
        // Provide a plain-text fallback
        message:    `New lease application received from ${data.full_name} (${data.email}) for ${data.property_address}. Move-in: ${data.move_in_date || 'N/A'}. Rent: $${data.monthly_rent || 'N/A'}/mo.`,
      }),
    });

    const web3Result = await web3Response.json();

    if (!web3Response.ok || !web3Result.success) {
      console.error('[lease-application] Web3Forms error:', web3Result);
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: false,
          message: 'Failed to send email notification. Please try again or contact us directly.',
        }),
      };
    }

    console.log('[lease-application] Email notification sent for:', data.full_name, '→', data.property_address);
  } catch (emailErr) {
    console.error('[lease-application] Email send exception:', emailErr);
    return {
      statusCode: 502,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: false,
        message: 'Network error while sending notification. Please try again.',
      }),
    };
  }

  // ── Step 2: Send DocuSign envelope via Pipedream webhook ────────────────────
  const PIPEDREAM_WEBHOOK_URL = process.env.PIPEDREAM_DOCUSIGN_WEBHOOK_URL;
  const DOCUSIGN_TEMPLATE_ID  = '133480d4-c9ba-47ce-b712-cd5a4e70d9e7';

  if (PIPEDREAM_WEBHOOK_URL) {
    try {
      const dsPayload = {
        templateId:    DOCUSIGN_TEMPLATE_ID,
        signerName:    data.full_name,
        signerEmail:   data.email,
        signerRole:    'Signer',
        emailSubject:  `Lease Application — Please Sign | ${data.property_address}`,
        emailBlurb:    `Dear ${data.full_name}, thank you for submitting your rental application for ${data.property_address}. Please review and sign the attached Residential Lease Application below. For questions, contact Axial Realty at (469) 980-8298.`,
        propertyAddress: data.property_address || '',
        moveInDate:      data.move_in_date      || '',
        monthlyRent:     data.monthly_rent      || '',
        applicantPhone:  data.mobile_phone      || '',
      };

      const dsResponse = await fetch(PIPEDREAM_WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(dsPayload),
      });

      if (!dsResponse.ok) {
        console.error('[lease-application] Pipedream/DocuSign webhook error:', dsResponse.status);
        // Non-fatal — email notification already delivered.
      } else {
        console.log('[lease-application] DocuSign envelope triggered for:', data.full_name, '→', data.email);
      }
    } catch (dsErr) {
      console.error('[lease-application] DocuSign webhook exception:', dsErr);
      // Non-fatal — email notification already delivered.
    }
  } else {
    console.log('[lease-application] PIPEDREAM_DOCUSIGN_WEBHOOK_URL not set — skipping DocuSign step.');
  }
  // ─── End DocuSign Block ────────────────────────────────────────────────────

  // ── Success Response ───────────────────────────────────────────────────────
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({
      success: true,
      message: 'Application received',
    }),
  };
};

// ─── CORS Headers ─────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// ─── Email HTML Builder ───────────────────────────────────────────────────────
function buildEmailHtml(d) {
  const ts = new Date().toLocaleString('en-US', {
    timeZone:     'America/Chicago',
    dateStyle:    'full',
    timeStyle:    'short',
  });

  // Helper to render a table row (handles undefined/null gracefully)
  const row = (label, value) =>
    `<tr>
      <td style="padding:7px 12px;font-size:13px;font-weight:600;color:#6b6455;background:#f8f5ef;white-space:nowrap;border-bottom:1px solid #e8e3d9;width:40%;">${label}</td>
      <td style="padding:7px 12px;font-size:13px;color:#1e1b14;background:#fff;border-bottom:1px solid #e8e3d9;">${value || '—'}</td>
    </tr>`;

  // Helper for section header row
  const sectionHeader = (title) =>
    `<tr>
      <td colspan="2" style="padding:14px 12px 8px;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#253151;background:#f0ede6;border-top:3px solid #c9a96e;">${title}</td>
    </tr>`;

  // Mask SSN
  const ssnRaw  = d.ssn || '';
  const ssnLast = ssnRaw.replace(/-/g, '').slice(-4);
  const ssnMask = ssnLast ? `***-**-${ssnLast}` : '—';

  // Co-applicants
  const coApps = [1, 2, 3]
    .map(i => d[`coapplicant_${i}_name`] ? `${d[`coapplicant_${i}_name`]} (${d[`coapplicant_${i}_rel`] || 'N/A'})` : null)
    .filter(Boolean)
    .join('; ') || '—';

  // Vehicles
  const vehicles = [1, 2, 3, 4]
    .map(i => {
      const make = d[`vehicle_${i}_make`];
      if (!make) return null;
      return `${d[`vehicle_${i}_year`] || ''} ${make} ${d[`vehicle_${i}_model`] || ''} · Plate: ${d[`vehicle_${i}_plate`] || '—'} ${d[`vehicle_${i}_state`] || ''}`.trim();
    })
    .filter(Boolean)
    .join('<br>') || '—';

  // Animals
  const animals = [1, 2, 3, 4]
    .map(i => {
      const breed = d[`animal_${i}_breed`];
      if (!breed) return null;
      return `${breed} · ${d[`animal_${i}_name`] || 'N/A'} · ${d[`animal_${i}_weight`] || '?'} · Neutered: ${d[`animal_${i}_neutered`] || '?'} · Bite: ${d[`animal_${i}_bite`] || '?'} · Assist: ${d[`animal_${i}_assistance`] || '?'}`;
    })
    .filter(Boolean)
    .join('<br>') || '—';

  // Occupants
  const occupants = [1, 2, 3, 4]
    .map(i => {
      const name = d[`occupant_${i}_name`];
      if (!name) return null;
      return `${name} · ${d[`occupant_${i}_rel`] || 'N/A'} · DOB: ${d[`occupant_${i}_dob`] || 'N/A'}`;
    })
    .filter(Boolean)
    .join('<br>') || '—';

  // How heard
  const heardVia = [
    d.heard_via_sign     ? 'Sign'         : null,
    d.heard_via_internet ? 'Internet'     : null,
    d.heard_via_agent    ? 'Agent'        : null,
    d.heard_via_other    ? `Other: ${d.heard_via_other_text || ''}` : null,
  ].filter(Boolean).join(', ') || '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lease Application — ${escHtml(d.full_name)}</title>
</head>
<body style="margin:0;padding:0;background:#f0ede6;font-family:'Inter',Arial,sans-serif;">

<div style="max-width:680px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(20,28,50,.12);">

  <!-- Header -->
  <div style="background:#1b2540;padding:28px 32px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="background:#c9a96e;width:4px;height:40px;border-radius:2px;flex-shrink:0;"></div>
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#c9a96e;margin-bottom:4px;">Axial Realty LLC</div>
        <div style="font-size:20px;font-weight:700;color:#fff;">New Lease Application</div>
      </div>
    </div>
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.1);font-size:12px;color:rgba(255,255,255,.55);">Received: ${ts} (Central Time)</div>
  </div>

  <!-- Quick Summary Bar -->
  <div style="background:#253151;padding:16px 32px;display:flex;gap:32px;flex-wrap:wrap;">
    <div style="color:rgba(255,255,255,.5);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">
      Applicant<br><span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:0;">${escHtml(d.full_name || '—')}</span>
    </div>
    <div style="color:rgba(255,255,255,.5);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">
      Property<br><span style="color:#c9a96e;font-size:13px;font-weight:700;letter-spacing:0;">${escHtml(d.property_address || '—')}</span>
    </div>
    <div style="color:rgba(255,255,255,.5);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">
      Move-in<br><span style="color:#fff;font-size:13px;font-weight:700;letter-spacing:0;">${escHtml(d.move_in_date || '—')}</span>
    </div>
    <div style="color:rgba(255,255,255,.5);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">
      Rent<br><span style="color:#fff;font-size:13px;font-weight:700;letter-spacing:0;">${d.monthly_rent ? '$' + d.monthly_rent + '/mo' : '—'}</span>
    </div>
  </div>

  <!-- Body -->
  <div style="padding:24px 32px 32px;">

    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e8e3d9;">
      ${sectionHeader('1 · Property &amp; Move-In')}
      ${row('Property Address', escHtml(d.property_address))}
      ${row('Anticipated Move-in Date', escHtml(d.move_in_date))}
      ${row('Lease Term Requested', d.initial_lease_term ? d.initial_lease_term + ' months' : '—')}
      ${row('Monthly Rent', d.monthly_rent ? '$' + d.monthly_rent : '—')}
      ${row('Security Deposit', d.security_deposit ? '$' + d.security_deposit : '—')}

      ${sectionHeader('2 · Applicant Identification')}
      ${row('Full Legal Name', escHtml(d.full_name))}
      ${row('Former Last Name', escHtml(d.former_last_name))}
      ${row('Date of Birth', escHtml(d.dob))}
      ${row('SSN (masked)', ssnMask)}
      ${row('Driver License #', escHtml(d.dl_number))}
      ${row('DL State', escHtml(d.dl_state))}
      ${row('Height', escHtml(d.height))}
      ${row('Weight', escHtml(d.weight))}
      ${row('Eye Color', escHtml(d.eye_color))}
      ${row('Hair Color', escHtml(d.hair_color))}
      ${row('Email', escHtml(d.email))}
      ${row('Mobile Phone', escHtml(d.mobile_phone))}
      ${row('Work Phone', escHtml(d.work_phone))}
      ${row('Home Phone', escHtml(d.home_phone))}
      ${row('Text Message Consent', escHtml(d.text_consent))}
      ${row('Co-Applicants', escHtml(d.has_coapplicants))}
      ${row('Co-Applicant Details', coApps)}

      ${sectionHeader('3 · Housing &amp; Employment History')}
      ${row('Viewed Property In Person?', escHtml(d.viewed_in_person))}
      ${row('Requested Repairs/Treatments', escHtml(d.requested_repairs))}
      ${row('Represented by Agent?', escHtml(d.has_agent))}
      ${row('Agent Name', escHtml(d.agent_name))}
      ${row('Agent Company', escHtml(d.agent_company))}
      ${row('Agent Email', escHtml(d.agent_email))}
      ${row('Agent Phone', escHtml(d.agent_phone))}
      ${row('How Heard About Property', heardVia)}

      ${sectionHeader('Current Residence')}
      ${row('Street', escHtml(d.curr_street))}
      ${row('Apt/Unit', escHtml(d.curr_apt))}
      ${row('City', escHtml(d.curr_city))}
      ${row('State', escHtml(d.curr_state))}
      ${row('ZIP', escHtml(d.curr_zip))}
      ${row('Landlord Name', escHtml(d.curr_landlord_name))}
      ${row('Landlord Phone', escHtml(d.curr_landlord_phone))}
      ${row('Landlord Email', escHtml(d.curr_landlord_email))}
      ${row('Monthly Rent', d.curr_rent ? '$' + d.curr_rent : '—')}
      ${row('Move-in Date', escHtml(d.curr_movein))}
      ${row('Move-out Date', escHtml(d.curr_moveout))}
      ${row('Reason for Moving', escHtml(d.curr_reason))}

      ${sectionHeader('Previous Residence')}
      ${row('Street', escHtml(d.prev_street))}
      ${row('Apt/Unit', escHtml(d.prev_apt))}
      ${row('City', escHtml(d.prev_city))}
      ${row('State', escHtml(d.prev_state))}
      ${row('ZIP', escHtml(d.prev_zip))}
      ${row('Landlord Name', escHtml(d.prev_landlord_name))}
      ${row('Landlord Phone', escHtml(d.prev_landlord_phone))}
      ${row('Landlord Email', escHtml(d.prev_landlord_email))}
      ${row('Monthly Rent', d.prev_rent ? '$' + d.prev_rent : '—')}
      ${row('Move-in Date', escHtml(d.prev_movein))}
      ${row('Move-out Date', escHtml(d.prev_moveout))}
      ${row('Reason for Moving', escHtml(d.prev_reason))}

      ${sectionHeader('Current Employer')}
      ${row('Employer Name', escHtml(d.emp_name))}
      ${row('Position / Title', escHtml(d.emp_position))}
      ${row('Address', escHtml(d.emp_address))}
      ${row('Verification Contact', escHtml(d.emp_contact))}
      ${row('Phone', escHtml(d.emp_phone))}
      ${row('Fax', escHtml(d.emp_fax))}
      ${row('Email', escHtml(d.emp_email))}
      ${row('Start Date', escHtml(d.emp_start))}
      ${row('Gross Monthly Income', d.emp_income ? '$' + d.emp_income : '—')}

      ${sectionHeader('Previous Employer')}
      ${row('Employer Name', escHtml(d.prev_emp_name))}
      ${row('Position / Title', escHtml(d.prev_emp_position))}
      ${row('Address', escHtml(d.prev_emp_address))}
      ${row('Verification Contact', escHtml(d.prev_emp_contact))}
      ${row('Phone', escHtml(d.prev_emp_phone))}
      ${row('Fax', escHtml(d.prev_emp_fax))}
      ${row('Email', escHtml(d.prev_emp_email))}
      ${row('Employed From', escHtml(d.prev_emp_from))}
      ${row('Employed To', escHtml(d.prev_emp_to))}
      ${row('Gross Monthly Income', d.prev_emp_income ? '$' + d.prev_emp_income : '—')}
      ${row('Other Income Sources', escHtml(d.other_income))}

      ${sectionHeader('Emergency Contact')}
      ${row('Name', escHtml(d.ec_name))}
      ${row('Relationship', escHtml(d.ec_relationship))}
      ${row('Address', [d.ec_address, d.ec_city, d.ec_state, d.ec_zip].filter(Boolean).join(', ') || '—')}
      ${row('Phone', escHtml(d.ec_phone))}
      ${row('Email', escHtml(d.ec_email))}

      ${sectionHeader('Other Occupants')}
      ${row('Occupants', occupants)}

      ${sectionHeader('4 · Vehicles')}
      ${row('Vehicles Listed', vehicles)}

      ${sectionHeader('4 · Animals / Pets')}
      ${row('Has Animals?', escHtml(d.has_animals))}
      ${row('Animal Details', animals)}

      ${sectionHeader('4 · Disclosure Questions')}
      ${row('Waterbed / Water Furniture', escHtml(d.waterbed))}
      ${row('Smoker / Vaper', escHtml(d.smoker))}
      ${row("Renter's Insurance", escHtml(d.renters_insurance))}
      ${row('Military Service', escHtml(d.military))}
      ${row('Military Orders ≤ 1 yr', escHtml(d.military_orders))}
      ${row('Ever Evicted', escHtml(d.evicted))}
      ${row('Asked to Move Out', escHtml(d.asked_to_move))}
      ${row('Breached Lease', escHtml(d.breached_lease))}
      ${row('Filed Bankruptcy', escHtml(d.bankruptcy))}
      ${row('Lost Property in Foreclosure', escHtml(d.foreclosure))}
      ${row('Criminal Conviction', escHtml(d.convicted))}
      ${row('Conviction Details', escHtml(d.convicted_details))}
      ${row('Registered Sex Offender', escHtml(d.sex_offender))}
      ${row('Sex Offender Details', escHtml(d.sex_offender_details))}
      ${row('Credit Problems', escHtml(d.credit_problems))}
      ${row('Credit Problem Details', escHtml(d.credit_details))}
      ${row('Additional Remarks', escHtml(d.additional_info))}

      ${sectionHeader('5 · Authorization')}
      ${row('Agreed to Authorization', d.auth_agree ? '✓ Yes — Applicant agreed' : '✗ Not checked')}
    </table>

    <!-- Footer note -->
    <div style="margin-top:20px;padding:14px 16px;background:#f8f5ef;border-radius:8px;border-left:3px solid #c9a96e;font-size:12px;color:#6b6455;line-height:1.6;">
      <strong style="color:#253151;">Next steps:</strong> Review the application, run credit &amp; background checks, then send the DocuSign lease agreement to the applicant at <a href="mailto:${escHtml(d.email)}" style="color:#c9a96e;">${escHtml(d.email)}</a>.
      <br>Applicant phone: <a href="tel:${escHtml(d.mobile_phone)}" style="color:#c9a96e;">${escHtml(d.mobile_phone)}</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#141c32;padding:16px 32px;text-align:center;">
    <p style="font-size:11px;color:rgba(255,255,255,.35);margin:0;">
      Axial Realty LLC · Frisco, TX · <a href="https://axialrealty.com" style="color:#c9a96e;">axialrealty.com</a> · (469) 980-8298<br>
      This email was automatically generated upon submission of a lease application.
    </p>
  </div>

</div>
</body>
</html>`;
}

// ─── Utility: HTML-escape a string ───────────────────────────────────────────
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');
}
