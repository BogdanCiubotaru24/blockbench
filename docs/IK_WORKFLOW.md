# Creating IK-ready Skeletons

1. Enable **IK** for each bone via the context menu.
2. Define rotation limits with *Set Rotation Limits*, enabling constraints and optionally locking a hinge axis.
3. Add a null object at the distal end of each bone using **Add Bone IK Target**.
4. Parent null objects as needed to build hierarchies.
5. Save the project to retain IK/FK state and rotation limits.

See `examples/sample_ik_skeleton.json` for a minimal example.
