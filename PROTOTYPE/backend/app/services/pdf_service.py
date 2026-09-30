import io
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from ..ml.engine import MLSafetyDisclaimer

def generate_screening_pdf(screening, user, explanations=None) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0d9488')
    )
    subtitle_style = ParagraphStyle(
        'SubtitleStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#64748b')
    )
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=10,
        spaceAfter=6
    )
    body_style = ParagraphStyle(
        'BodyText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor('#334155')
    )
    bold_body = ParagraphStyle(
        'BoldBody',
        parent=body_style,
        fontName='Helvetica-Bold'
    )
    disclaimer_style = ParagraphStyle(
        'DisclaimerStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#64748b')
    )

    elements = []

    # Title Banner
    elements.append(Paragraph("Osteo-Optix — Knee Osteoarthritis Screening Report", title_style))
    elements.append(Paragraph("AI-Assisted Multimodal Knee OA Screening & Triage System (North Eastern Region India)", subtitle_style))
    elements.append(Spacer(1, 10))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0d9488'), spaceAfter=12))

    # Patient & Worker Demographics Table
    user_name = user.name if user else "NER Patient"
    user_id = user.user_id if user else screening.user_id
    worker_id = screening.worker_id or "HW_NER_01"
    age_sex = f"{user.age} Yrs / {user.sex}" if user else "N/A"
    district_state = f"{user.district}, {user.state}" if user else "Assam"
    occ_load = user.occupational_load if user else "Moderate"
    terrain = user.terrain_exposure if user else "Moderate"
    date_str = screening.timestamp.strftime("%Y-%m-%d %H:%M:%S UTC") if screening.timestamp else "N/A"

    demo_data = [
        [Paragraph("<b>Patient Name:</b>", body_style), Paragraph(user_name, body_style), Paragraph("<b>Patient ID:</b>", body_style), Paragraph(user_id, body_style)],
        [Paragraph("<b>Age / Sex:</b>", body_style), Paragraph(age_sex, body_style), Paragraph("<b>District / State:</b>", body_style), Paragraph(district_state, body_style)],
        [Paragraph("<b>Occupational Load:</b>", body_style), Paragraph(occ_load, body_style), Paragraph("<b>Terrain Exposure:</b>", body_style), Paragraph(terrain, body_style)],
        [Paragraph("<b>Screened By Worker:</b>", body_style), Paragraph(worker_id, body_style), Paragraph("<b>Screening Date:</b>", body_style), Paragraph(date_str, body_style)],
    ]
    t_demo = Table(demo_data, colWidths=[1.4*inch, 2.2*inch, 1.4*inch, 2.2*inch])
    t_demo.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    elements.append(t_demo)
    elements.append(Spacer(1, 12))

    # Risk Summary Box
    risk_pct = round(screening.risk_probability * 100, 1)
    risk_cat = screening.risk_category

    cat_color = colors.HexColor('#047857')
    if "Severe" in risk_cat:
        cat_color = colors.HexColor('#dc2626')
    elif "Moderate" in risk_cat:
        cat_color = colors.HexColor('#ea580c')
    elif "Mild" in risk_cat:
        cat_color = colors.HexColor('#ca8a04')

    risk_style = ParagraphStyle('RiskText', parent=body_style, fontName='Helvetica-Bold', fontSize=14, leading=18, textColor=cat_color)
    elements.append(Paragraph(f"Screening Severity Index: {risk_pct}% &mdash; Category: {risk_cat}", risk_style))
    elements.append(Spacer(1, 6))

    modalities_text = screening.available_modalities.replace(",", ", ")
    elements.append(Paragraph(f"<b>Modalities Analyzed:</b> {modalities_text} | <b>Model Version:</b> {screening.model_version}", body_style))
    elements.append(Spacer(1, 10))

    # SHAP Feature Explanations
    elements.append(Paragraph("Multimodal SHAP Feature Contribution Analysis", section_heading))
    exp_table_data = [[Paragraph("<b>Feature Symbol</b>", bold_body), Paragraph("<b>Contribution</b>", bold_body), Paragraph("<b>Clinical Observation</b>", bold_body)]]

    if explanations:
        for exp in explanations[:6]:
            exp_table_data.append([
                Paragraph(exp.feature, body_style),
                Paragraph(f"{exp.contribution}%", bold_body),
                Paragraph(exp.description, body_style)
            ])
    else:
        exp_table_data.append([Paragraph("WOMAC & Demographic Risk Factors", body_style), Paragraph("100%", bold_body), Paragraph("Clinical survey baseline risk evaluation", body_style)])

    t_exp = Table(exp_table_data, colWidths=[2.2*inch, 1.2*inch, 3.8*inch])
    t_exp.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    elements.append(t_exp)
    elements.append(Spacer(1, 12))

    # Triage Guidance
    elements.append(Paragraph("Clinical Triage Guidance (Section 5.2)", section_heading))
    from ..ml.engine import calculate_screening_risk
    _, _, _, _, triage_guidance = calculate_screening_risk(
        user_age=user.age if user else 45,
        user_sex=user.sex if user else "Female",
        occupational_load=user.occupational_load if user else "Moderate",
        terrain_exposure=user.terrain_exposure if user else "Moderate",
        previous_knee_injury=user.previous_knee_injury if user else False
    )
    elements.append(Paragraph(triage_guidance, body_style))
    elements.append(Spacer(1, 16))

    # Mandatory Disclaimer
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#cbd5e1'), spaceAfter=8))
    elements.append(Paragraph(f"<b>CLINICAL SAFETY NOTICE:</b> {MLSafetyDisclaimer.TEXT}", disclaimer_style))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
