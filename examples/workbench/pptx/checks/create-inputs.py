"""
Creates presentation.pptx — a 4-slide TechVision Corp Q3 2025 deck.

Used as input for the extract-pptx-facts case. The expected answer.json is:
  {
    "title": "TechVision Corp: Q3 2025 Results",
    "slideCount": 4,
    "revenue": "$5.1M",
    "customerCount": 2341
  }
"""

import os
from pptx import Presentation
from pptx.util import Inches

prs = Presentation()
blank = prs.slide_layouts[6]  # Blank layout


def add_slide(prs, layout, title_text, body_lines=None):
    slide = prs.slides.add_slide(layout)
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.9))
    title_box.text_frame.text = title_text
    if body_lines:
        body_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(9), Inches(3.5))
        tf = body_box.text_frame
        tf.text = body_lines[0]
        for line in body_lines[1:]:
            tf.add_paragraph().text = line
    return slide


add_slide(prs, blank,
          'TechVision Corp: Q3 2025 Results',
          ['Quarterly Business Review', 'October 15, 2025'])

add_slide(prs, blank,
          'Financial Highlights',
          ['Revenue: $5.1M', 'Growth: 18% YoY', 'Operating Margin: 24%'])

add_slide(prs, blank,
          'Customer Metrics',
          ['Total Customers: 2,341', 'New Customers: 312', 'Churn Rate: 1.8%'])

add_slide(prs, blank,
          'Looking Ahead',
          ['Q4 Target: $6.2M', 'New Product Launch: November', 'Geographic Expansion: EMEA'])

output_path = os.path.join(os.environ.get('WORK', '/work'), 'presentation.pptx')
prs.save(output_path)
print(f'Created {output_path} with {len(prs.slides)} slides')
