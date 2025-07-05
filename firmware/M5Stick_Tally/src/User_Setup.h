#ifndef USER_SETUP_H
#define USER_SETUP_H

#define USER_SETUP_ID 255

// M5StickC Plus display configuration
#define ST7789_DRIVER

// ESP32 GPIO pin configuration for M5StickC Plus
#define TFT_MISO -1
#define TFT_MOSI 15
#define TFT_SCLK 13
#define TFT_CS   5  
#define TFT_DC   23
#define TFT_RST  18
#define TFT_BL   -1

// Use SPI2_HOST (FSPI) for ESP32
#define USE_FSPI_PORT

// M5StickC Plus screen dimensions
#define TFT_WIDTH 135
#define TFT_HEIGHT 240

// Font loading - optimize for tally display
#define LOAD_GLCD   // Font 1. Original Adafruit 8 pixel font needs ~1820 bytes in FLASH
#define LOAD_FONT2  // Font 2. Small 16 pixel high font, needs ~3534 bytes in FLASH, 96 characters
#define LOAD_FONT4  // Font 4. Medium 26 pixel high font, needs ~5848 bytes in FLASH, 96 characters
#define LOAD_FONT6  // Font 6. Large 48 pixel font, needs ~2666 bytes in FLASH, only characters 1234567890:-.apm
#define LOAD_FONT7  // Font 7. 7 segment 48 pixel font, needs ~2438 bytes in FLASH, only characters 1234567890:.
#define LOAD_GFXFF  // FreeFonts. Include access to the 48 Adafruit_GFX free fonts FF1 to FF48

#define SMOOTH_FONT

// SPI Speeds - optimized for M5StickC Plus
#define SPI_FREQUENCY  40000000
#define SPI_READ_FREQUENCY  20000000
#define SPI_TOUCH_FREQUENCY  2500000

// Display settings
#define TFT_RGB_ORDER TFT_RGB  // Colour order Red-Green-Blue
#define TFT_INVERSION_OFF  // ST7789 display inversion mode

#endif // USER_SETUP_H
