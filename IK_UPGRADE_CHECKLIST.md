# Inverse Kinematics Upgrade Checklist

## IK/FK Switching
- [x] Add per-bone toggle to switch between IK and FK modes.
- [x] Update animation runtime to honor IK/FK toggles.
- [x] Provide UI controls for enabling or disabling IK on existing bones.
- [x] Ensure removing an IK target reverts the bone to FK.
- [x] Persist IK/FK state in project files.

## Local Rotation Clamping/Locking
- [x] Define per-axis rotation limits for bones (e.g., hinge or knee behaviour).
- [x] Expose rotation limit settings in the UI.
- [x] Enforce limits during both IK and FK transformations.
- [x] Save rotation limit data in project files.
- [x] Visualize rotation constraints in the viewport.

## Null Point Hierarchies
- [x] Allow null points to parent other null points or bones.
- [x] Update the IK solver to traverse null point hierarchies.
- [x] Provide UI for managing null point parenting.
- [x] Ensure hierarchy updates propagate to IK calculations.

## Bone via Null Point + Clamp
- [x] Represent bones using hinge positions combined with local rotation limits.
- [x] Place a null point at the distal end of each bone to act as an IK target.
- [x] Combine clamp constraints with the null point to mimic bone behaviour.
- [x] Build a sample skeleton using null points and clamps to validate the IK workflow.
- [x] Document the process for creating IK-ready skeletons.

