# usage: python3 tools/levelsim/plot.py trace.json out.png [title]
import json, math, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
d = json.load(open(sys.argv[1])); L = d['layout']
fig, ax = plt.subplots(figsize=(10, 10))
COL = {'wall': '#c33', 'block': '#e9a23b', 'ledge': '#9bb', 'rail': '#b0b', 'pad': '#8c8', 'kicker': '#36c', 'qp': '#14a', 'stairs': '#777'}
for it in L['items']:
    c, s = math.cos(it['yaw']), math.sin(it['yaw'])
    hw, hd = it['hw'], it['hd']
    col = COL.get(it['type'], '#999')
    if it['type'] == 'block' and it['h'] <= 0.42: col = '#cdb'
    pts = [(it['x'] + a * c + b * s, it['z'] - a * s + b * c) for a, b in [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]]
    ax.add_patch(Polygon(pts, closed=True, fc=col, ec='k', lw=0.4, alpha=0.85))
    if it['type'] in ('kicker', 'qp'):
        ax.arrow(it['x'] - s * 0 , it['z'], math.sin(it['yaw']) * 1.5, math.cos(it['yaw']) * 1.5, head_width=0.6, color='w')
    if it['type'] == 'rail':
        ax.plot([it['x'] - math.sin(it['yaw']) * hd, it['x'] + math.sin(it['yaw']) * hd], [it['z'] - math.cos(it['yaw']) * hd, it['z'] + math.cos(it['yaw']) * hd], color='#b0b', lw=2.5)
for r in L.get('rails', []):
    ax.plot([r['s'][0], r['e'][0]], [r['s'][2], r['e'][2]], color='#b0b', lw=1.5)
cols = ['#0a0', '#08c', '#c60', '#a0a', '#066', '#aa0']
for i, p in enumerate(d.get('paths', [])):
    xs = [q[0] for q in p]; zs = [q[1] for q in p]
    ax.plot(xs, zs, '-', color=cols[i % 6], lw=0.9, alpha=0.8)
    ax.plot([q[0] for q in p if q[2] == 1], [q[1] for q in p if q[2] == 1], '.', color=cols[i % 6], ms=4)
B = L.get('bounds', 23)
ax.plot([-B, B, B, -B, -B], [-B, -B, B, B, -B], 'k-', lw=3)
ax.set_xlim(-B - 1, B + 1); ax.set_ylim(-B - 1, B + 1); ax.set_aspect('equal'); ax.grid(alpha=0.2)
ax.set_title(sys.argv[3] if len(sys.argv) > 3 else '')
plt.savefig(sys.argv[2], dpi=75, bbox_inches='tight')
