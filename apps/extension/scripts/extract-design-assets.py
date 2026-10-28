"""Extract original vector layers, without redrawing them, from the supplied Figma export."""
import copy
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ET.register_namespace('', 'http://www.w3.org/2000/svg')
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
source = ET.parse(Path(sys.argv[1]) / 'Pop Up.svg').getroot()
layers = list(source[0])
definitions = {el.get('id'): el for el in source.iter() if el.get('id')}
destination = Path(__file__).resolve().parents[1] / 'src/popup/assets'

def extract(name, viewbox, indices):
    x, y, width, height = viewbox
    root = ET.Element('{http://www.w3.org/2000/svg}svg', {
        'width': str(width), 'height': str(height),
        'viewBox': f'{x} {y} {width} {height}', 'fill': 'none',
    })
    for index in indices:
        root.append(copy.deepcopy(layers[index]))
    defs = ET.SubElement(root, '{http://www.w3.org/2000/svg}defs')
    added = set()
    while True:
        refs = set(re.findall(r'(?:url\(#|href="#)([^)" ]+)', ET.tostring(root, encoding='unicode')))
        missing = refs - added
        if not missing:
            break
        for ref in sorted(missing):
            defs.append(copy.deepcopy(definitions[ref]))
            added.add(ref)
    ET.ElementTree(root).write(destination / name, encoding='utf-8', xml_declaration=False)

extract('design-background.svg', (0, 132, 600, 700), [1])
extract('design-hero.svg', (0, 169, 600, 340), range(2, 245))
extract('design-logo.svg', (32, 16, 191, 42), range(253, 263))
extract('design-close.svg', (540, 24.5, 24, 24), [265])

source = ET.parse(Path(sys.argv[1]) / 'Applying And Testing The Codes.svg').getroot()
definitions = {el.get('id'): el for el in source.iter() if el.get('id')}
layers = list(source[0][7][0])
# The spinner's still parts, and its green arc (layer 10) on its own so only the arc rotates. The
# arc's box is centred on the arc itself (147.5, 408.836), not on the outer ring, so rotating it
# about its centre traces a perfect circle; popup.css lifts it 1.164px to sit back in place.
extract('design-testing.svg', (123, 385.5, 49, 49), [*range(1, 10), 11])
extract('design-testing-arc.svg', (123, 384.336, 49, 49), [10])
extract('design-pending.svg', (123, 444.9, 49, 49), range(13, 23))
