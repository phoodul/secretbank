import { invoke } from "@tauri-apps/api/core";

/**
 * credential 을 project 로 묶는다 — 그룹 전용 Usage 레코드 생성.
 *
 * where_kind 는 env_var 기본값, where_value 는 빈 문자열(상세 미입력 = 단순 묶기).
 * UsageSection / ProjectDetail 은 빈 where_value 를 "그룹 연결" 로 표시한다.
 * 실패해도 호출측에서 무시 가능하도록 예외를 던진다(자격증명 자체는 이미 생성됨).
 */
export async function linkCredentialToProject(
  credentialId: string,
  projectId: string,
): Promise<void> {
  await invoke("usage_create", {
    input: {
      credential_id: credentialId,
      project_id: projectId,
      deployment_id: null,
      where_kind: "env_var",
      where_value: "",
    },
  });
}
