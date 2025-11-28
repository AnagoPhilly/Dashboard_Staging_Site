// js/ad_generator.js

let isSpanish = false; 

// 1. UI Toggles
window.toggleDay = function(btn) { btn.classList.toggle('selected'); };
window.toggleChip = function(chip) { chip.classList.toggle('selected'); };

function getSelectedText(selector) {
    return Array.from(document.querySelectorAll(`${selector}.selected`))
        .map(el => el.textContent.trim());
}

window.applyJobPreset = function() {
    window.showToast("Job duties updated for selected role.");
};

// 2. Main Generation Logic
window.generateAd = function(lang = 'en') {
    isSpanish = (lang === 'es');
    document.getElementById('btn_translate').textContent = isSpanish ? "Revert to English" : "Translate to Spanish";

    // Gather Inputs
    const role = document.getElementById('ad_role_preset').value;
    const loc = document.getElementById('ad_loc').value || 'Your Area';
    const pay = document.getElementById('ad_pay').value || 'Competitive Pay';
    const hours = document.getElementById('ad_hours').value || 'Flexible';
    const contactMethod = document.getElementById('ad_contact_method').value;
    const contactDetail = document.getElementById('ad_contact').value || '[Insert Info]';
    const isUrgent = document.getElementById('ad_urgent').checked;
    const isBilingual = document.getElementById('ad_spanish_pref').checked;
    const customOffer = document.getElementById('ad_offer_custom').value;
    
    // Auto-Save
    if(contactDetail && contactDetail !== '[Insert Info]') {
        localStorage.setItem('cleanDash_contact', contactDetail);
        localStorage.setItem('cleanDash_loc', loc);
    }

    // --- DICTIONARIES ---
    const dict = isSpanish ? {
        headline: isUrgent ? "CONTRATACIÓN URGENTE" : "ESTAMOS CONTRATANDO",
        sub: "SE NECESITA PERSONAL DE LIMPIEZA",
        intro: "Buscamos personal confiable y detallista para unirse a nuestro equipo profesional de limpieza.",
        loc: "UBICACIÓN",
        pay: "PAGO",
        sched: "DÍAS",
        hrs: "HORAS",
        why: "POR QUÉ TRABAJAR AQUÍ",
        reqs: "REQUISITOS",
        duties: "DEBERES",
        apply: "CÓMO APLICAR",
        contact_text: "Envíe mensaje de texto o llame",
        contact_email: "Envíe su currículum por correo",
        contact_link: "Aplique en este enlace",
        duties_gen: "Limpieza general, desinfección de baños, asegurar instalaciones",
        duties_floor: "Decapado y encerado, extracción de alfombras, pulido",
        duties_day: "Mantenimiento de baños, monitoreo de áreas comunes, respuesta a derrames",
        duties_lead: "Inspección de trabajo, entrenamiento, inventario"
    } : {
        headline: isUrgent ? "URGENT HIRE" : "NOW HIRING",
        sub: "COMMERCIAL CLEANING STAFF NEEDED",
        intro: "We are looking for reliable, detail-oriented individuals to join our professional cleaning team.",
        loc: "LOCATION",
        pay: "PAY RATE",
        sched: "SCHEDULE",
        hrs: "HOURS",
        why: "WHY WORK HERE",
        reqs: "WHAT WE ARE LOOKING FOR",
        duties: "JOB DUTIES",
        apply: "HOW TO APPLY",
        contact_text: "Text or Call",
        contact_email: "Email Resume to",
        contact_link: "Apply directly at",
        duties_gen: "General cleaning (trash, vacuum, mop), Restroom sanitization, Securing facility",
        duties_floor: "Strip and wax VCT, Carpet extraction, Buffing and burnishing",
        duties_day: "Maintain restrooms, Monitor lobby, Respond to spills, Trash removal",
        duties_lead: "Inspect work, Train staff, Manage inventory, Fill-in cleaning"
    };

    // --- FORMAL MAP ---
    const formalMap = isSpanish ? {
        "Weekly Pay": "Pago semanal competitivo",
        "Direct Deposit": "Depósito directo disponible",
        "Paid Training": "Entrenamiento pagado",
        "Uniforms Provided": "Uniformes proporcionados",
        "No Weekends": "Lunes a viernes (Sin fines de semana)",
        "Stay Active": "Entorno de trabajo activo",
        "Work Alone / Independent": "Trabajo independiente",
        "Opportunities for Growth": "Oportunidades de crecimiento",
        "Reliable Vehicle": "Debe tener vehículo confiable",
        "Smartphone": "Debe tener teléfono inteligente",
        "Clean Background": "Debe pasar verificación de antecedentes",
        "Lift 25+ lbs": "Capacidad para levantar 25+ libras",
        "Authorized to Work in US": "Autorizado para trabajar en EE. UU."
    } : {
        "Weekly Pay": "Competitive weekly pay schedule",
        "Direct Deposit": "Convenient direct deposit available",
        "Paid Training": "Comprehensive paid training provided",
        "Uniforms Provided": "Company uniforms provided at no cost",
        "No Weekends": "Monday through Friday schedule (No weekends)",
        "Stay Active": "Active work environment",
        "Work Alone / Independent": "Ability to work independently",
        "Opportunities for Growth": "Opportunities for career advancement",
        "Reliable Vehicle": "Must have reliable transportation to/from site",
        "Smartphone": "Must possess a smartphone for timekeeping",
        "Clean Background": "Must be able to pass a background check",
        "Lift 25+ lbs": "Ability to lift 25+ lbs consistently",
        "Authorized to Work in US": "Must be legally authorized to work in the US"
    };

    const getFormalArr = (containerId) => {
        const chips = Array.from(document.querySelectorAll(`#${containerId} .chip.selected`));
        return chips.map(c => {
            const text = c.textContent.trim();
            const key = text; 
            return formalMap[key] ? formalMap[key] : text;
        });
    };

    const offerArr = getFormalArr('perksContainer');
    if (customOffer) offerArr.push(customOffer);
    
    const reqArr = getFormalArr('reqsContainer');
    reqArr.push(isSpanish ? "Debe tener 18 años de edad o más" : "Must be 18 years of age or older");
    if (isBilingual) reqArr.push(isSpanish ? "Bilingüe (Inglés/Español) es una ventaja" : "Bilingual (English/Spanish) is a plus");

    const days = getSelectedText('.day-btn');
    const dayString = days.length > 0 ? days.join(' / ') : (isSpanish ? 'Días Flexibles' : 'Flexible Days');

    let dutiesArr = [];
    if (role === 'floor') dutiesArr = dict.duties_floor.split(', ');
    else if (role === 'day') dutiesArr = dict.duties_day.split(', ');
    else if (role === 'lead') dutiesArr = dict.duties_lead.split(', ');
    else dutiesArr = dict.duties_gen.split(', ');

    let applyText = dict.contact_text;
    if (contactMethod === 'email') applyText = dict.contact_email;
    if (contactMethod === 'link') applyText = dict.contact_link;

    // --- A. TEXT OUTPUT ---
    const textAd = `
${dict.headline}: ${dict.sub} in ${loc}

${dict.intro}

${dict.loc}: ${loc}
${dict.pay}: ${pay}
${dict.sched}: ${dayString}
${dict.hrs}: ${hours}

${dict.why}:
${offerArr.map(i => `- ${i}`).join('\n')}

${dict.reqs}:
${reqArr.map(i => `- ${i}`).join('\n')}

${dict.duties}:
${dutiesArr.map(i => `- ${i}`).join('\n')}

=========================================
${dict.apply}:
${applyText}: ${contactDetail}
=========================================
`.trim();

    document.getElementById('adOutput').value = textAd;

    // --- B. HTML OUTPUT (Compact 2-Col + Bottom Apply) ---
    const htmlAd = `
        <div class="flyer-container">
            <div class="flyer-header">
                <h1>${dict.headline}</h1>
                <div class="flyer-sub">${dict.sub}</div>
            </div>

            <p class="flyer-intro">${dict.intro}</p>

            <div class="flyer-grid">
                <div class="flyer-box">
                    <span class="flyer-label">${dict.loc}</span>
                    <div class="flyer-value">${loc}</div>
                </div>
                <div class="flyer-box">
                    <span class="flyer-label">${dict.pay}</span>
                    <div class="flyer-value pay">${pay}</div>
                </div>
                <div class="flyer-box">
                    <span class="flyer-label">${dict.sched}</span>
                    <div class="flyer-value">${dayString}</div>
                </div>
                <div class="flyer-box">
                    <span class="flyer-label">${dict.hrs}</span>
                    <div class="flyer-value">${hours}</div>
                </div>
            </div>

            <div class="flyer-content-grid">
                
                <div class="flyer-column">
                    <div class="flyer-section">
                        <h3>${dict.why}</h3>
                        <ul class="flyer-list">
                            ${offerArr.map(i => `<li>${i}</li>`).join('')}
                        </ul>
                    </div>
                </div>

                <div class="flyer-column">
                    <div class="flyer-section">
                        <h3>${dict.reqs}</h3>
                        <ul class="flyer-list">
                            ${reqArr.map(i => `<li>${i}</li>`).join('')}
                        </ul>
                    </div>

                    <div class="flyer-section">
                        <h3>${dict.duties}</h3>
                        <ul class="flyer-list">
                            ${dutiesArr.map(i => `<li>${i}</li>`).join('')}
                        </ul>
                    </div>
                </div>

            </div>

            <div class="flyer-section flyer-apply-section">
                <h3>${dict.apply}</h3>
                <div class="flyer-apply-text">
                    ${applyText}: <br>
                    <span style="font-size:16px;">${contactDetail}</span>
                </div>
            </div>
        </div>
    `;

    document.getElementById('hidden-flyer').innerHTML = htmlAd;
};

// 3. Translation Toggle
window.toggleTranslation = function() {
    const currentIsSpanish = document.getElementById('btn_translate').textContent.includes("Revert");
    window.generateAd(currentIsSpanish ? 'en' : 'es');
}

// 4. Utils
window.copyAdToClipboard = function() {
    const text = document.getElementById('adOutput').value;
    if(!text || text.includes('Click')) return alert("Generate an ad first!");
    navigator.clipboard.writeText(text).then(() => {
        window.showToast("Ad text copied to clipboard!");
    });
};

window.printAd = function() {
    const content = document.getElementById('hidden-flyer').innerHTML;
    if(!content) return alert("Generate an ad first!");

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.write(`
        <html>
        <head>
            <link rel="stylesheet" href="style.css">
            <style>
                body { margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; }
                .flyer-container { width: 100% !important; max-width: none !important; padding: 20px !important; }
                .flyer-content-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 30px !important; }
            </style>
        </head>
        <body>${content}</body>
        </html>
    `);
    doc.close();
    
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 500);
};

window.downloadAdPdf = async function() {
    const element = document.getElementById('hidden-flyer');
    if(!element.innerHTML) return alert("Generate an ad first!");

    const origPos = element.style.position;
    element.style.position = 'fixed';
    element.style.left = '0';
    element.style.top = '0';
    element.style.zIndex = '-9999';
    element.style.width = '800px'; 
    element.style.background = 'white';
    
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    element.style.position = origPos;

    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save("Job_Flyer.pdf");
};

window.resetAdForm = function() {
    document.querySelectorAll('input').forEach(i => i.value = '');
    document.querySelectorAll('textarea').forEach(t => t.value = '');
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    document.getElementById('adOutput').value = '';
    document.getElementById('hidden-flyer').innerHTML = '';
    isSpanish = false;
    document.getElementById('btn_translate').textContent = "Translate to Spanish";
};

document.addEventListener('DOMContentLoaded', () => {
    const savedContact = localStorage.getItem('cleanDash_contact');
    const savedLoc = localStorage.getItem('cleanDash_loc');
    if(document.getElementById('ad_contact') && savedContact) document.getElementById('ad_contact').value = savedContact;
    if(document.getElementById('ad_loc') && savedLoc) document.getElementById('ad_loc').value = savedLoc;
});