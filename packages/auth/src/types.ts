export interface JwtPayload {
  sub: string;
  email?: string;
  name?: string;
  image?: string;
  provider?: string;
  iat: number;
  exp: number;
}
