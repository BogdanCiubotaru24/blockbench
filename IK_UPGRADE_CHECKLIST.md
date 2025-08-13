# Inverse Kinematics Upgrade Checklist

## IK/FK Switching
- [ ] Add per-bone toggle to switch between IK and FK modes.
- [ ] Update animation runtime to honor IK/FK toggles.
- [ ] Provide UI controls for enabling or disabling IK on existing bones.
- [ ] Ensure removing an IK target reverts the bone to FK.
- [ ] Persist IK/FK state in project files.

## Local Rotation Clamping/Locking
- [ ] Define per-axis rotation limits for bones (e.g., hinge or knee behaviour).
- [ ] Expose rotation limit settings in the UI.
- [ ] Enforce limits during both IK and FK transformations.
- [ ] Save rotation limit data in project files.
- [ ] Visualize rotation constraints in the viewport.

## Null Point Hierarchies
- [ ] Allow null points to parent other null points or bones.
- [ ] Update the IK solver to traverse null point hierarchies.
- [ ] Provide UI for managing null point parenting.
- [ ] Ensure hierarchy updates propagate to IK calculations.

## Bone via Null Point + Clamp
- [ ] Represent bones using hinge positions combined with local rotation limits.
- [ ] Place a null point at the distal end of each bone to act as an IK target.
- [ ] Combine clamp constraints with the null point to mimic bone behaviour.
- [ ] Build a sample skeleton using null points and clamps to validate the IK workflow.
- [ ] Document the process for creating IK-ready skeletons.

