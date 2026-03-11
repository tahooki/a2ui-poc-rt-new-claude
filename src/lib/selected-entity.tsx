"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface SelectedEntityContextValue {
  selectedEntityId: string | null;
  setSelectedEntityId: (value: string | null) => void;
  clearSelectedEntityId: () => void;
}

const SelectedEntityContext = createContext<SelectedEntityContextValue | null>(
  null,
);

export function SelectedEntityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  return (
    <SelectedEntityContext.Provider
      value={{
        selectedEntityId,
        setSelectedEntityId,
        clearSelectedEntityId: () => setSelectedEntityId(null),
      }}
    >
      {children}
    </SelectedEntityContext.Provider>
  );
}

export function useSelectedEntity() {
  const context = useContext(SelectedEntityContext);
  if (!context) {
    throw new Error("useSelectedEntity must be used within SelectedEntityProvider");
  }
  return context;
}

export function useSyncSelectedEntity(entityId: string | null | undefined) {
  const { setSelectedEntityId, clearSelectedEntityId } = useSelectedEntity();

  useEffect(() => {
    if (entityId && entityId.trim().length > 0) {
      setSelectedEntityId(entityId);
      return;
    }

    clearSelectedEntityId();
  }, [clearSelectedEntityId, entityId, setSelectedEntityId]);
}
