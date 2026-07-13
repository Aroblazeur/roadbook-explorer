const defaultStageForm = {
  dayNumber: "",
  title: "",
  start: "",
  end: "",
  dist: "",
  gain: "",
  loss: "",
  difficulty: "",
  accommodation: "",
  description: "",
  notes: "",
  warning: "",
  mapEmbed: "",
  photoUrl: "",
  day: "",
  label: "",
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
