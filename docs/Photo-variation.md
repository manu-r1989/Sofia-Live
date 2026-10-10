# Photo variation after 4.48.7

New Sofia photos rotate through ten head/gaze/camera profiles, including an upright head with zero side tilt and gentle inclinations in both directions. Recent three profiles are avoided. Expressions vary within each mood; serious, annoyed and skeptical moods do not get cheerful expressions. Body posture offers five variations within the current bed/sofa/seated/general situation. Optional free-hand gestures respect the crop and activity, never add props or cover the face.

The canonical master stays the first identity reference. Facial geometry and hair color remain binding; the master pose and expression are explicitly excluded as templates. Lighting/crop variants preserve the source pose and gesture unless posture is explicitly changed. Text/live avatar and voice code are unchanged.

Validation: JavaScript syntax and full regression suite, including upright/left/right head profiles, recent-pose avoidance, mood-specific expressions, bed/seated posture, gestures, identity prompt and existing variant boundaries. Deployed image appearance requires real generation within the existing quota; no quota bypass or reset.
