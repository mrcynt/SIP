import { createContext, useState, useContext } from 'react';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  // BACA LOCALSTORAGE SECARA LANGSUNG SAAT STATE DIBUAT (TANPA MENUNGGU USEEFFECT)
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('sigma_user_session');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  
  // isLoading langsung false karena data user sudah ditarik secara instan di atas
  const [isLoading, setIsLoading] = useState(false);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('sigma_user_session', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('sigma_user_session');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);