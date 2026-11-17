# Hermon opening review

Arendt reviewed the opening and ground-contact plan independently against edfb283. The review covered the landing markup and CSS, the court geometry, the suit frame order, and the layout audit.

- The overlapping court faces need separate depths. The design retains the thin layers within 15 mm of the flat floor and removes the two raised central patches. The court test samples terrain height at the inlay vertices.
- A pose correction would need to respect takeoff, touchdown, and the saved checkpoint. The asset check measures the lowest skinned geometry in bind pose and through the sword idle. The court change gives the model clearance without adding another positioning layer.
- The opening briefing contains the heading, source, objective, Start, and controls. The layout audit measures the new hierarchy directly and checks the existing first-visit note.

Dalton independently reviewed the implementation against edfb283. The initial sole check missed the visual lift and final pose layers. The regression now runs the grounded suit pose, authored clips, idle layer, and springs at the spawn, including the first paused frame and reduced motion. The layout audit now checks overflow within the briefing alongside viewport bounds.
