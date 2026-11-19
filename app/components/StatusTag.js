export const STATUS_LABELS = {
  GOOD_FIT: 'Good fit',
  GOOD_FIT_FLAGGED: 'Good fit, flagged',
  NOT_A_FIT: 'Not a fit',
  NEEDS_REVIEW: 'Needs review',
  NO_CONTACT: 'No contact',
  ERROR: 'Error',
};

export default function StatusTag({ status }) {
  const s = STATUS_LABELS[status] ? status : 'ERROR';
  return <span className={`tag tag-${s}`}>{STATUS_LABELS[s]}</span>;
}
