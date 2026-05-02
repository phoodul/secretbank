import { SignJWT, importPKCS8 } from "jose";

export interface InstallationToken {
  token: string;
  expires_at: string; // ISO 8601
}

interface GitHubTokenResponse {
  token: string;
  expires_at: string;
}

/**
 * GitHub App JWT (RS256) 를 발급한다.
 * iat = now - 60s (clock skew 보정), exp = now + 10min, iss = appId.
 */
export async function generateAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const privateKey = await importPKCS8(privateKeyPem, "RS256");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 10 * 60)
    .setIssuer(appId)
    .sign(privateKey);
}

/**
 * GitHub App JWT 로 installation access token 을 발급한다.
 * 401 / 404 는 구조화된 에러로 throw 한다.
 */
export async function fetchInstallationToken(
  appId: string,
  privateKeyPem: string,
  installationId: number,
): Promise<InstallationToken> {
  const jwt = await generateAppJwt(appId, privateKeyPem);
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "api-vault-relay/0.1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new GitHubApiError(resp.status, text);
  }

  const data = (await resp.json()) as GitHubTokenResponse;
  return { token: data.token, expires_at: data.expires_at };
}

export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`GitHub API error ${status}: ${body}`);
    this.name = "GitHubApiError";
  }
}
