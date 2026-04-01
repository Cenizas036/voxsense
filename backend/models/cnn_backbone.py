import torch
import torch.nn as nn


class CNNBackbone(nn.Module):
    def __init__(self):
        super(CNNBackbone, self).__init__()

        self.features = nn.Sequential(
            nn.Conv2d(1, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(32, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(64, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(128, 256, 3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(),
            nn.MaxPool2d(2),
        )

        # Dynamically compute flatten size
        with torch.no_grad():
            dummy = torch.zeros(1, 1, 128, 216)
            dummy = self.features(dummy)
            self.flatten_size = dummy.numel()

    def forward(self, x):
        x = self.features(x)
        x = x.view(x.size(0), -1)
        return x
