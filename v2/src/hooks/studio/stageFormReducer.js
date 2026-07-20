const defaultStageForm = {
  dayNumber: "",
  title: "",
  start: "",
  end: "",
  dist: "",
  gain: "",
  loss: "",
  description: "",
  notes: "",
  gpxFile: null,
  photoUrl: "",
  day: "",
  duration: "",
};

function stageFormReducer(state, action) {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_FORM":
      return { ...state, ...action.payload };
    case "RESET":
      return { ...defaultStageForm };
    default:
      return state;
  }
}

export { defaultStageForm, stageFormReducer };
