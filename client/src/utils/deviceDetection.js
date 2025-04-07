/**
 * Checks if the current device is a mobile device
 * @returns {boolean} True if the device is mobile, false otherwise
 */
export const isMobile = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  // Regular expression to check for mobile devices
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  
  // Check if the screen width is less than 768px (typical mobile breakpoint)
  const isSmallScreen = window.innerWidth < 768;
  
  return mobileRegex.test(userAgent) || isSmallScreen;
};

/**
 * Checks if the device has touch capabilities
 * @returns {boolean} True if the device supports touch, false otherwise
 */
export const isTouchDevice = () => {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
};

/**
 * Gets the device orientation
 * @returns {string} 'portrait' or 'landscape'
 */
export const getOrientation = () => {
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
};

/**
 * Gets the device type based on screen size and user agent
 * @returns {string} 'mobile', 'tablet', or 'desktop'
 */
export const getDeviceType = () => {
  const mobile = isMobile();
  
  if (!mobile) return 'desktop';
  
  // Check if it's a tablet based on screen size
  const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;
  
  return isTablet ? 'tablet' : 'mobile';
}; 