"use client";

import { useCallback, useState } from "react";

export default function useStudioEditing() {
  const [expandedStages, setExpandedStages] = useState({});
  const [showStageForm, setShowStageForm] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const isStageExpanded = useCallback((stageId) => {
    return expandedStages[stageId] === true;
  }, [expandedStages]);

  const toggleStage = useCallback((stageId) => {
    setExpandedStages(prev => ({ ...prev, [stageId]: !prev[stageId] }));
  }, []);

  const resetEditing = useCallback(() => {
    setExpandedStages({});
    setShowStageForm(false);
    setDuplicating(false);
  }, []);

  return {
    expandedStages, setExpandedStages,
    showStageForm, setShowStageForm,
    duplicating, setDuplicating,
    isStageExpanded,
    toggleStage,
    resetEditing,
  };
}
