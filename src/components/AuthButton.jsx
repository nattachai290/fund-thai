import { signIn, signOut } from '../utils/googleAuth';

export default function AuthButton({ user, onSignOut }) {
  if (!user) {
    return (
      <button className="btn btn-login" onClick={signIn}>
        🔑 เข้าสู่ระบบด้วย Google
      </button>
    );
  }
  return (
    <div className="user-info">
      <span className="user-name">{user.name || user.email}</span>
      <button
        className="btn btn-logout"
        onClick={() => {
          signOut();
          onSignOut();
        }}
      >
        ออกจากระบบ
      </button>
    </div>
  );
}
