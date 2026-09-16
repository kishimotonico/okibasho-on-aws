import type { PreSignUpTriggerEvent } from 'aws-lambda';

/**
 * メールアドレスが S3 キーになるため、EMAIL_DOMAIN 配下で揺れのない形のアドレスだけ通す。
 * 例外を投げると Cognito がサインアップ（ローカルユーザーの作成を含む）を拒否する。
 */
export function createHandler(emailDomain: string) {
  return async (event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> => {
    const reason = rejectReason(event, emailDomain);
    if (reason) {
      // メールアドレスは出さない
      console.log(
        JSON.stringify({ result: 'rejected', triggerSource: event.triggerSource, reason }),
      );
      throw new Error(`このアカウントは利用できません（${reason}）`);
    }
    return event;
  };
}

export function rejectReason(
  event: PreSignUpTriggerEvent,
  emailDomain: string,
): string | undefined {
  const { email, email_verified: emailVerified } = event.request.userAttributes;
  if (!email || !email.endsWith(`@${emailDomain}`)) {
    return 'domain';
  }
  if (email !== email.toLowerCase() || email.includes('+')) {
    return 'format';
  }
  if (event.triggerSource === 'PreSignUp_ExternalProvider' && emailVerified !== 'true') {
    return 'unverified';
  }
  return undefined;
}
